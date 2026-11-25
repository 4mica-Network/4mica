import { debug, note } from "../ui/log.js";
import {
  anythingSent,
  beginSending,
  explorerLink,
  recordLostBroadcast,
  recordPayment,
  recordTransaction,
  type SentPayment,
} from "./outcome.js";

export interface TransportFailure {
  /** Scheme and host of the request that failed. */
  origin: string;
  reason: "timeout" | "unreachable";
  /** Node's errno name, such as ECONNREFUSED, when there is one. */
  detail?: string;
  timeoutSecs: number;
  /** It is the core or facilitator in use, not some other host. */
  service: boolean;
  /**
   * The message of the error `fetch` threw. An error is about this request
   * only if it is that error or quotes it: the SDK recovers from some failed
   * requests, and what goes wrong afterwards is not this.
   */
  message: string;
  /** Something had already been sent when this request failed. */
  afterSend?: boolean;
}

/**
 * The longest wait a timer holds. Past 2^31-1 ms Node fires it after 1 ms
 * instead, which would fail every request at once.
 */
export const MAX_TIMEOUT_SECS = Math.floor((2 ** 31 - 1) / 1000);

let lastFailure: TransportFailure | undefined;

/**
 * What Node's `fetch` says when the connection failed, whatever the reason,
 * which is in `cause`. Its other `TypeError`s are about the request itself,
 * such as a GET with a body, and no host is to blame for those.
 */
const NO_ANSWER = "fetch failed";

/** On a wrapper, the `fetch` it wraps: installing twice must not nest. */
const WRAPS = Symbol("4mica.wraps");
type Wrapped = typeof fetch & { [WRAPS]?: typeof fetch };

/** The most recent request that got no response, for error reporting. */
export const lastTransportFailure = () => lastFailure;

const timeoutError = () =>
  new DOMException("The operation was aborted due to timeout", "TimeoutError");

/** The JSON-RPC ids of the transactions a request broadcasts. */
function broadcastIds(body: unknown): unknown[] {
  if (typeof body !== "string" || !body.includes("eth_sendRawTransaction")) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(body);
    const calls = Array.isArray(parsed) ? parsed : [parsed];
    return calls
      .filter(
        (c): c is { id: unknown } =>
          typeof c === "object" &&
          c !== null &&
          (c as { method?: unknown }).method === "eth_sendRawTransaction",
      )
      .map((c) => c.id);
  } catch {
    return [];
  }
}

/**
 * What a JSON-RPC answer says about the broadcasts with these ids: the
 * hashes it gives, and how many of them it answered at all. A refusal
 * (`error`) is an answer; a body that is not JSON-RPC answers nothing.
 */
async function broadcastAnswers(
  response: Response,
  ids: unknown[],
): Promise<{ hashes: string[]; answered: number }> {
  try {
    const parsed: unknown = await response.json();
    const answers = (Array.isArray(parsed) ? parsed : [parsed]).filter(
      (a): a is { id?: unknown; result?: unknown; error?: unknown } =>
        typeof a === "object" &&
        a !== null &&
        ids.includes((a as { id?: unknown }).id),
    );
    return {
      hashes: answers.flatMap((a) =>
        typeof a.result === "string" && /^0x[0-9a-fA-F]{64}$/.test(a.result)
          ? [a.result]
          : [],
      ),
      answered: answers.filter(
        (a) => typeof a.result === "string" || a.error != null,
      ).length,
    };
  } catch {
    return { hashes: [], answered: 0 };
  }
}

/**
 * The terms an x402 payment header was signed for. v2 names them in
 * `accepted`; v1 carries only the network.
 */
function paymentIn(headers: Headers, url: string): SentPayment | undefined {
  const header =
    headers.get("PAYMENT-SIGNATURE") ?? headers.get("X-PAYMENT") ?? undefined;
  if (!header) return undefined;
  try {
    const envelope = JSON.parse(
      Buffer.from(header.trim(), "base64").toString("utf8"),
    ) as { network?: unknown; accepted?: Record<string, unknown> };
    const terms = envelope.accepted ?? {};
    const text = (v: unknown) => (v === undefined ? undefined : String(v));
    return {
      url,
      network: text(terms.network ?? envelope.network),
      asset: text(terms.asset),
      amountRaw: text(terms.amount ?? terms.maxAmountRequired),
      payTo: text(terms.payTo),
    };
  } catch {
    return { url };
  }
}

/** `https://core.example/core/tokens`, without query or credentials. */
function describe(url: string): string {
  if (!URL.canParse(url)) return "(not a url)";
  const { origin, pathname } = new URL(url);
  return origin + pathname;
}

/**
 * Gives every request the process makes a timeout on getting a response
 * and on each part of its body, and remembers which host did not answer.
 * The SDK reports a dead connection as "fetch failed" with no host, and
 * waits on a stalled one for as long as Node will.
 *
 * `services` are the core and facilitator in use, so that a failure can be
 * told from one of a seller's server, which `fetch` also goes through here.
 *
 * Also the one place every request passes, so it is where `--debug` lines
 * are written, and where a broadcast transaction or a payment sent to a
 * seller is noticed (see `outcome.ts`).
 *
 * shortcut: this wraps the global `fetch` because the SDK takes no fetch or
 * timeout option for its core and chain requests. Move it into the SDK's
 * http layer once that exists.
 *
 * shortcut: the transaction hash and the payment are read off the wire here
 * because the SDK says nothing while a send is in progress: it returns the
 * hash only with the receipt, and a payment only once the seller confirms
 * it. A progress callback on its sends would replace both.
 */
export function installRequestTimeout(
  timeoutSecs: number,
  services: (string | undefined)[] = [],
): void {
  const current: Wrapped = globalThis.fetch;
  const original = current[WRAPS] ?? current;
  lastFailure = undefined;
  const ours = new Set(
    services.flatMap((url) =>
      url && URL.canParse(url) ? [new URL(url).origin] : [],
    ),
  );
  const limit = timeoutSecs * 1000;

  const wrapper: Wrapped = async (input, init) => {
    const url =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : String(input);
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const origin = URL.canParse(url) ? new URL(url).origin : url;
    const started = Date.now();
    const fail = (error: unknown, timedOut: boolean) => {
      const message = error instanceof Error ? error.message : String(error);
      const failed = {
        origin,
        timeoutSecs,
        service: ours.has(origin),
        message,
        afterSend: anythingSent(),
      };
      if (timedOut) {
        lastFailure = { ...failed, reason: "timeout" };
      } else if (error instanceof TypeError && error.message === NO_ANSWER) {
        const detail = (error.cause as { code?: unknown } | undefined)?.code;
        lastFailure = {
          ...failed,
          reason: "unreachable",
          detail: typeof detail === "string" ? detail : undefined,
        };
      }
      debug(
        `${method} ${describe(url)} failed after ${Date.now() - started}ms: ${message}`,
      );
    };

    // What leaves with this request, noticed before it goes: once it is on
    // the wire, it is out whatever happens to the answer.
    const broadcasts = broadcastIds(init?.body);
    if (broadcasts.length > 0 && !anythingSent()) {
      beginSending("a transaction", []);
    }
    const payment = paymentIn(
      new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      ),
      url,
    );
    if (payment) recordPayment(payment);

    // Not `AbortSignal.timeout`: that one cannot be called off. The limit is
    // on waiting: for a response to start, then for each part of the body,
    // so a slow download that keeps arriving is not a failure.
    const controller = new AbortController();
    const timeout = controller.signal;
    let timer: NodeJS.Timeout | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(timeoutError()), limit);
    };
    const own =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = own ? AbortSignal.any([own, timeout]) : timeout;

    let response: Response;
    arm();
    try {
      response = await original(input, { ...init, signal });
    } catch (error) {
      clearTimeout(timer);
      fail(error, timeout.aborted);
      // Sent, and the node's word on it never came: it may have taken it.
      if (broadcasts.length > 0) recordLostBroadcast();
      throw error;
    }
    clearTimeout(timer);
    debug(
      `${method} ${describe(url)} → ${response.status} (${Date.now() - started}ms)`,
    );

    if (broadcasts.length > 0) {
      const { hashes, answered } = await broadcastAnswers(
        response.clone(),
        broadcasts,
      );
      for (const hash of hashes) {
        if (recordTransaction(hash))
          note(`transaction sent: ${explorerLink(hash)}`);
      }
      if (answered < broadcasts.length) recordLostBroadcast();
    }

    if (!response.body) return response;
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(stream) {
        // Armed only while a part is wanted: a body nobody reads is not late.
        arm();
        try {
          const { done, value } = await reader.read();
          clearTimeout(timer);
          if (done) stream.close();
          else stream.enqueue(value);
        } catch (error) {
          clearTimeout(timer);
          fail(error, timeout.aborted);
          stream.error(error);
        }
      },
      cancel(reason) {
        clearTimeout(timer);
        return reader.cancel(reason);
      },
    });
    const wrapped = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    Object.defineProperty(wrapped, "url", { value: response.url });
    Object.defineProperty(wrapped, "redirected", {
      value: response.redirected,
    });
    return wrapped;
  };
  wrapper[WRAPS] = original;
  globalThis.fetch = wrapper;
}

const PROXY_VARIABLES = [
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
];

/**
 * Sends requests through the proxy that `HTTPS_PROXY` or `HTTP_PROXY` names,
 * skipping the hosts in `NO_PROXY`, as curl and most CLIs do. Node's own
 * `fetch` ignores those variables unless started with `NODE_USE_ENV_PROXY`.
 * undici is loaded only when one is set.
 */
export async function routeThroughEnvProxy(
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  if (!PROXY_VARIABLES.some((name) => env[name])) return false;
  if (env.NODE_USE_ENV_PROXY === "1") return false;
  const { EnvHttpProxyAgent, setGlobalDispatcher } = await import("undici");
  setGlobalDispatcher(new EnvHttpProxyAgent());
  debug("using the proxy from the environment");
  return true;
}
