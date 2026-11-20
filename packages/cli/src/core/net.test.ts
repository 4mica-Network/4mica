import { afterEach, describe, expect, it } from "vitest";
import { toCliError } from "../errors.js";
import { installRequestTimeout, lastTransportFailure } from "./net.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Wraps whatever `fetch` is stubbed in. */
async function install(stub: typeof fetch, timeoutSecs: number) {
  globalThis.fetch = stub;
  installRequestTimeout(timeoutSecs);
  return lastTransportFailure;
}

describe("installRequestTimeout", () => {
  it("aborts a request that gets no response, and remembers the host", async () => {
    const stalled: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
    const failure = await install(stalled, 0.02);
    await expect(fetch("https://core.example/core/tokens")).rejects.toThrow();
    expect(failure()).toEqual({
      origin: "https://core.example",
      reason: "timeout",
      timeoutSecs: 0.02,
    });
  });

  it("remembers a host that refused the connection", async () => {
    const refused: typeof fetch = async () => {
      throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    };
    const failure = await install(refused, 30);
    await expect(fetch("http://127.0.0.1:3000/core/health")).rejects.toThrow();
    expect(failure()).toMatchObject({
      origin: "http://127.0.0.1:3000",
      reason: "unreachable",
      detail: "ECONNREFUSED",
    });
  });

  it("passes a response through untouched", async () => {
    const failure = await install(async () => new Response("ok"), 30);
    expect(await (await fetch("https://core.example")).text()).toBe("ok");
    expect(failure()).toBeUndefined();
  });
});

describe("toCliError with a transport failure", () => {
  const failure = {
    origin: "http://127.0.0.1:3000",
    reason: "unreachable",
    detail: "ECONNREFUSED",
    timeoutSecs: 30,
  } as const;

  it("names the host the SDK's message leaves out", () => {
    const sdk = new Error(
      "request to /core/tokens failed: TypeError: fetch failed",
    );
    expect(toCliError(sdk, failure)).toMatchObject({
      message: "could not reach http://127.0.0.1:3000 (ECONNREFUSED)",
      code: "UNREACHABLE",
    });
  });

  it("reports a timeout with the limit that was hit", () => {
    const aborted = new DOMException("The operation timed out", "TimeoutError");
    expect(
      toCliError(aborted, { ...failure, reason: "timeout", detail: undefined }),
    ).toMatchObject({
      message: "no response from http://127.0.0.1:3000 within 30s",
      code: "TIMEOUT",
    });
  });

  it("leaves an unrelated error alone even after a failed request", () => {
    const other = new Error("the wallet holds 0 USDC but this needs 5");
    expect(toCliError(other, failure)).toBe(other);
  });
});

describe("installing twice", () => {
  it("wraps the original once, not its own wrapper", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response("ok");
    };
    installRequestTimeout(30);
    installRequestTimeout(30);
    await fetch("https://core.example");
    expect(calls).toBe(1);
  });
});
