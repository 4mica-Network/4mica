export interface TransportFailure {
  /** Scheme and host of the request that failed. */
  origin: string;
  reason: "timeout" | "unreachable";
  /** Node's errno name, such as ECONNREFUSED, when there is one. */
  detail?: string;
  timeoutSecs: number;
}

let lastFailure: TransportFailure | undefined;

/** On a wrapper, the `fetch` it wraps: installing twice must not nest. */
const WRAPS = Symbol("4mica.wraps");
type Wrapped = typeof fetch & { [WRAPS]?: typeof fetch };

/** The most recent request that got no response, for error reporting. */
export const lastTransportFailure = () => lastFailure;

/**
 * Gives every request the process makes a timeout, and remembers which host
 * did not answer. The SDK reports a dead connection as "fetch failed" with
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
    const timeout = AbortSignal.timeout(timeoutSecs * 1000);
    const own =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = own ? AbortSignal.any([own, timeout]) : timeout;
    try {
      return await original(input, { ...init, signal });
    } catch (error) {
      const url = input instanceof Request ? input.url : String(input);
      const origin = URL.canParse(url) ? new URL(url).origin : url;
      if (timeout.aborted) {
        lastFailure = { origin, reason: "timeout", timeoutSecs };
      } else if (error instanceof TypeError) {
        const detail = (error.cause as { code?: unknown } | undefined)?.code;
        lastFailure = {
          origin,
          reason: "unreachable",
          detail: typeof detail === "string" ? detail : undefined,
          timeoutSecs,
        };
      }
      throw error;
    }
  };
  wrapper[WRAPS] = original;
  globalThis.fetch = wrapper;
}
