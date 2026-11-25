import { once } from "node:events";
import { type AddressInfo, createServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(failure()).toMatchObject({
      origin: "https://core.example",
      reason: "timeout",
      timeoutSecs: 0.02,
      service: false,
      message: "The operation was aborted due to timeout",
    });
  });

  it("tells the core and facilitator in use from any other host", async () => {
    const refused: typeof fetch = async () => {
      throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    };
    globalThis.fetch = refused;
    installRequestTimeout(30, [
      "https://core.example/",
      undefined,
      "not a url",
    ]);
    await expect(fetch("https://core.example/core/health")).rejects.toThrow();
    expect(lastTransportFailure()).toMatchObject({ service: true });
    await expect(fetch("https://seller.example/report")).rejects.toThrow();
    expect(lastTransportFailure()).toMatchObject({ service: false });
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

  it("does not blame the host for a request that was never sent", async () => {
    // What `fetch` throws for a GET with a body: also a TypeError.
    const invalid: typeof fetch = async () => {
      throw new TypeError("Request with GET/HEAD method cannot have body.");
    };
    const failure = await install(invalid, 30);
    await expect(fetch("https://api.example.com/x")).rejects.toThrow(
      "cannot have body",
    );
    expect(failure()).toBeUndefined();
  });

  describe("with Node's own fetch", () => {
    it("records a refused connection", async () => {
      // A port that was just in use, and is closed again.
      const server = createServer().listen(0, "127.0.0.1");
      await once(server, "listening");
      const { port } = server.address() as AddressInfo;
      server.close();
      await once(server, "close");

      const failure = await install(realFetch, 30);
      const origin = `http://127.0.0.1:${port}`;
      await expect(fetch(`${origin}/core/health`)).rejects.toThrow();
      expect(failure()).toMatchObject({
        origin,
        reason: "unreachable",
        detail: "ECONNREFUSED",
      });
    });

    it("records nothing for a request it refuses to send", async () => {
      const failure = await install(realFetch, 30);
      const sent = fetch("http://127.0.0.1:9/x", { method: "GET", body: "{}" });
      await expect(sent).rejects.toThrow(TypeError);
      expect(failure()).toBeUndefined();
      // So the command reports the real problem, not an unreachable host.
      const error = await sent.catch((e: unknown) => e);
      expect(toCliError(error, failure())).toBe(error);
    });
  });

  /** A body sent in parts, `gap` ms apart; `stallAfter` parts, then nothing. */
  const trickle =
    (
      parts: number,
      gap: number,
      stallAfter = Number.POSITIVE_INFINITY,
    ): typeof fetch =>
    async (_input, init) =>
      new Response(
        new ReadableStream({
          async start(controller) {
            init?.signal?.addEventListener("abort", () =>
              controller.error(init.signal?.reason),
            );
            for (let i = 0; i < parts; i++) {
              if (i >= stallAfter) return;
              await new Promise((r) => setTimeout(r, gap));
              controller.enqueue(new TextEncoder().encode(`part${i} `));
            }
            controller.close();
          },
        }),
      );

  it("does not cut off a response that keeps arriving", async () => {
    // Each part within the limit, the whole well past it.
    const failure = await install(trickle(6, 15), 0.05);
    const response = await fetch("https://seller.example/report");
    expect(await response.text()).toBe("part0 part1 part2 part3 part4 part5 ");
    expect(failure()).toBeUndefined();
  });

  it("gives up on a body that stops arriving", async () => {
    // Headers and one part, then nothing: a half-open connection.
    const failure = await install(trickle(3, 5, 1), 0.05);
    const response = await fetch("https://core.example/core/tokens");
    await expect(response.text()).rejects.toThrow(/timeout/);
    expect(failure()).toMatchObject({
      origin: "https://core.example",
      reason: "timeout",
    });
  });

  it("does not time out a body nobody reads", async () => {
    const failure = await install(trickle(1, 5), 0.02);
    await fetch("https://core.example/core/health");
    await new Promise((r) => setTimeout(r, 60));
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
    service: true,
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
      suggestions: [
        expect.stringContaining("4mica status"),
        expect.stringContaining("4mica config"),
      ],
    });
  });

  it("does not point at 4mica's services when a seller's url is down", () => {
    const seller = {
      ...failure,
      origin: "https://seller.example",
      service: false,
    };
    const told = toCliError(new TypeError("fetch failed"), seller) as {
      message: string;
      suggestions?: string[];
    };
    expect(told.message).toBe(
      "could not reach https://seller.example (ECONNREFUSED)",
    );
    expect(told.suggestions).toBeUndefined();
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

describe("what leaves through the wrapper", () => {
  const HASH = `0x${"ab".repeat(32)}`;

  it("prints a transaction's hash as soon as the chain has it", async () => {
    const { resetOutcome, sentTransactions, anythingSent } = await import(
      "./outcome.js"
    );
    resetOutcome();
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    globalThis.fetch = async () =>
      Response.json({ jsonrpc: "2.0", id: 7, result: HASH });
    installRequestTimeout(30);
    const response = await fetch("https://rpc.example", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 7,
        method: "eth_sendRawTransaction",
        params: ["0x02f8…"],
      }),
    });
    // The caller still reads the answer itself.
    expect(await response.json()).toMatchObject({ result: HASH });
    expect(sentTransactions()).toEqual([HASH]);
    expect(anythingSent()).toBe(true);
    expect(stderr).toHaveBeenCalledWith(`transaction sent: ${HASH}\n`);
    stderr.mockRestore();
    resetOutcome();
  });

  it("knows a payment has gone to a seller once its header is sent", async () => {
    const { resetOutcome, sentPayments } = await import("./outcome.js");
    resetOutcome();
    globalThis.fetch = async () => new Response("ok");
    installRequestTimeout(30);
    const accepted = {
      network: "eip155:84532",
      asset: "0xT",
      amount: "5",
      payTo: "0xS",
    };
    await fetch("https://seller.example/r", {
      headers: {
        "PAYMENT-SIGNATURE": Buffer.from(
          JSON.stringify({ x402Version: 2, accepted, payload: {} }),
        ).toString("base64"),
      },
    });
    expect(sentPayments()).toEqual([
      {
        url: "https://seller.example/r",
        network: "eip155:84532",
        asset: "0xT",
        amountRaw: "5",
        payTo: "0xS",
      },
    ]);
    resetOutcome();
  });

  it("writes debug lines with no query, header or body in them", async () => {
    const { runtime } = await import("./runtime.js");
    runtime.debug = true;
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    globalThis.fetch = async () => new Response("ok", { status: 201 });
    installRequestTimeout(30);
    await fetch("https://core.example/core/x?token=SECRET", {
      method: "POST",
      headers: { authorization: "Bearer SECRET" },
      body: "SECRET",
    });
    runtime.debug = false;
    const written = stderr.mock.calls.map(([chunk]) => String(chunk)).join("");
    stderr.mockRestore();
    expect(written).toContain("POST https://core.example/core/x → 201");
    expect(written).not.toContain("SECRET");
  });
});

describe("routeThroughEnvProxy", () => {
  it("does nothing without a proxy variable, or when Node already uses one", async () => {
    const { routeThroughEnvProxy } = await import("./net.js");
    expect(await routeThroughEnvProxy({})).toBe(false);
    expect(
      await routeThroughEnvProxy({
        HTTPS_PROXY: "http://proxy:3128",
        NODE_USE_ENV_PROXY: "1",
      }),
    ).toBe(false);
  });
});
