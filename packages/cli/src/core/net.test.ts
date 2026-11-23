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
      message: "The operation was aborted due to timeout",
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

  it("does not cut off a response that is still arriving", async () => {
    // Headers at once, the body after the limit has passed.
    const slowBody: typeof fetch = async (_input, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () =>
              controller.error(init.signal?.reason),
            );
            setTimeout(() => {
              controller.enqueue(new TextEncoder().encode("the report"));
              controller.close();
            }, 80);
          },
        }),
      );
    const failure = await install(slowBody, 0.02);
    const response = await fetch("https://seller.example/report");
    expect(await response.text()).toBe("the report");
    expect(failure()).toBeUndefined();
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
    message: "fetch failed",
  } as const;
  const timedOut = {
    ...failure,
    reason: "timeout",
    detail: undefined,
    message: "The operation was aborted due to timeout",
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
    const aborted = new DOMException(timedOut.message, "TimeoutError");
    expect(toCliError(aborted, timedOut)).toMatchObject({
      message: "no response from http://127.0.0.1:3000 within 30s",
      code: "TIMEOUT",
    });
  });

  it("does not say try again when the transaction may have been sent", () => {
    class FourMicaError extends Error {}
    class SponsorshipError extends FourMicaError {}
    class OutcomeUnknownError extends SponsorshipError {}
    const unknown = new OutcomeUnknownError(
      "facilitator request failed: The operation was aborted due to timeout",
    );
    const told = toCliError(unknown, timedOut) as {
      code: string;
      message: string;
      suggestions: string[];
    };
    expect(told.code).toBe("OUTCOME_UNKNOWN");
    expect(told.message).toBe(
      "no response from http://127.0.0.1:3000 within 30s; this may or may not have gone through",
    );
    expect(told.suggestions.join(" ")).not.toMatch(/try again/);
    expect(told.suggestions.join(" ")).toContain("4mica balance");

    // With no failed request on record, the SDK's own words are kept.
    expect(
      toCliError(
        new OutcomeUnknownError("facilitator returned 502: bad gateway"),
      ),
    ).toMatchObject({
      code: "OUTCOME_UNKNOWN",
      message:
        "facilitator returned 502: bad gateway; this may or may not have gone through",
    });
  });

  it("leaves an unrelated error alone even after a failed request", () => {
    const other = new Error("the wallet holds 0 USDC but this needs 5");
    expect(toCliError(other, failure)).toBe(other);
  });

  it("does not blame a request the SDK recovered from for a later timeout", () => {
    // The facilitator refused the connection, the SDK sent the transaction
    // itself, and waiting for the receipt is what failed.
    const receipt = new Error(
      'Timed out while waiting for transaction with hash "0xfeed" to be confirmed.',
    );
    expect(toCliError(receipt, failure)).toBe(receipt);
    expect(toCliError(receipt, timedOut)).toBe(receipt);
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
