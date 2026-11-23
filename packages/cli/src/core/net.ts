export interface TransportFailure {
  /** Scheme and host of the request that failed. */
  origin: string;
  reason: "timeout" | "unreachable";
  /** Node's errno name, such as ECONNREFUSED, when there is one. */
  detail?: string;
  timeoutSecs: number;
  /**
   * The message of the error `fetch` threw. An error is about this request
   * only if it is that error or quotes it: the SDK recovers from some failed
   * requests, and what goes wrong afterwards is not this.
   */
  message: string;
}

let lastFailure: TransportFailure | undefined;

/** On a wrapper, the `fetch` it wraps: installing twice must not nest. */
const WRAPS = Symbol("4mica.wraps");
type Wrapped = typeof fetch & { [WRAPS]?: typeof fetch };

/** The most recent request that got no response, for error reporting. */
export const lastTransportFailure = () => lastFailure;

/**
 * Gives every request the process makes a timeout on getting a response,
 * and remembers which host did not answer. The SDK reports a dead connection as "fetch failed" with
 * no host, and waits on a stalled one for as long as Node will.
 *
 * shortcut: this wraps the global `fetch` because the SDK takes no fetch or
 * timeout option for its core and chain requests. Move it into the SDK's
 * http layer once that exists.
 */
export function installRequestTimeout(timeoutSecs: number): void {
  const current: Wrapped = globalThis.fetch;
  const original = current[WRAPS] ?? current;
  lastFailure = undefined;
  const wrapper: Wrapped = async (input, init) => {
    // Not `AbortSignal.timeout`: that one cannot be called off, and would
    // cut short a response that is still arriving. The limit is on waiting
    // for a response to start, so a slow download is not a failure.
    const controller = new AbortController();
    const timeout = controller.signal;
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException(
            "The operation was aborted due to timeout",
            "TimeoutError",
          ),
        ),
      timeoutSecs * 1000,
    );
    const own =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = own ? AbortSignal.any([own, timeout]) : timeout;
    try {
      const response = await original(input, { ...init, signal });
      clearTimeout(timer);
      return response;
    } catch (error) {
      clearTimeout(timer);
      const url = input instanceof Request ? input.url : String(input);
      const origin = URL.canParse(url) ? new URL(url).origin : url;
      const message = error instanceof Error ? error.message : String(error);
      if (timeout.aborted) {
        lastFailure = { origin, reason: "timeout", timeoutSecs, message };
      } else if (error instanceof TypeError) {
        const detail = (error.cause as { code?: unknown } | undefined)?.code;
        lastFailure = {
          origin,
          reason: "unreachable",
          detail: typeof detail === "string" ? detail : undefined,
          timeoutSecs,
          message,
        };
      }
      throw error;
    }
  };
  wrapper[WRAPS] = original;
  globalThis.fetch = wrapper;
}
