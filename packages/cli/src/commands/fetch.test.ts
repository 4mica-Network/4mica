import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withSession } from "../core/session.js";
import { runCommand } from "../test/run.js";
import { pinJson } from "../test/shape.js";
import Fetch from "./fetch.js";

const payment = {
  protocol: "x402",
  network: "eip155:84532",
  asset: { symbol: "USDC", address: "0xToken", decimals: 6 },
  amount: "0.1",
  amountRaw: 100_000n,
  payTo: "0xSeller",
};
const client = { fetch: vi.fn(), paymentFor: vi.fn() };

vi.mock("../core/session.js", () => ({
  withSession: vi.fn((_settings, use) => use(client)),
}));

const realFetch = globalThis.fetch;

const SELLER = "0x00000000000000000000000000000000000005e1";
const required = {
  x402Version: 2,
  accepts: [
    { scheme: "exact", network: "eip155:8453", amount: "1", payTo: "0xA" },
    {
      scheme: "4mica-credit",
      network: "eip155:84532",
      asset: "0xToken",
      amount: "100000",
      payTo: SELLER,
    },
  ],
};
const b64 = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64");
const paymentRequired = () =>
  new Response(null, {
    status: 402,
    headers: { "PAYMENT-REQUIRED": b64(required) },
  });

/** The url, unpaid, as the network would answer it. */
const server = vi.fn<typeof fetch>();
/** What the SDK sends when it pays: the request again, with the payment. */
const paidRequest = (url: string, init?: RequestInit) =>
  globalThis.fetch(url, {
    ...init,
    headers: {
      "PAYMENT-SIGNATURE": b64({
        x402Version: 2,
        accepted: required.accepts[1],
        payload: {},
      }),
    },
  });

beforeEach(() => {
  process.exitCode = undefined;
  server.mockImplementation(async () => paymentRequired());
  globalThis.fetch = server;
  client.fetch.mockResolvedValue(new Response('{"report":1}'));
  client.paymentFor.mockReturnValue(payment);
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.clearAllMocks();
});

const URL_ = "https://api.example.com/report";

describe("fetch", () => {
  it("passes the spend limits to the session, where the paying happens", async () => {
    await runCommand(Fetch, [
      URL_,
      "--max",
      "0.50 USDC",
      "--pay-to",
      SELLER,
      "--json",
    ]);
    expect(withSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function),
      {
        spend: { perPayment: ["0.50 USDC"], payTo: [SELLER] },
        fetch: expect.any(Function),
      },
    );
  });

  it("hands the SDK the 402 it has, so the url is not asked twice", async () => {
    client.fetch.mockImplementation(async () => {
      const [, , options] = vi.mocked(withSession).mock.calls[0];
      const replayed = await (options?.fetch as typeof fetch)(URL_);
      expect(replayed.status).toBe(402);
      return new Response("ok");
    });
    await runCommand(Fetch, [URL_, "--json"]);
    expect(server).toHaveBeenCalledOnce();
  });

  it("returns the body and what was paid", async () => {
    const { json } = await runCommand(Fetch, [URL_, "--json"]);
    pinJson("fetch", json, "paid");
    expect(json).toMatchObject({
      status: 200,
      body: '{"report":1}',
      payment: {
        amount: "0.1",
        amountRaw: "100000",
        payTo: "0xSeller",
        settled: true,
      },
    });
  });

  it("needs no wallet or core for a url that charges nothing", async () => {
    server.mockImplementation(async () => new Response("free"));
    const { json } = await runCommand(Fetch, [URL_, "--json"]);
    expect(json).toMatchObject({ status: 200, body: "free", payment: null });
    expect(withSession).not.toHaveBeenCalled();
    pinJson("fetch", json);
  });

  it("returns a body that is not text as base64, and says so", async () => {
    // The first bytes of a PNG: 0x89 is not utf8.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    client.fetch.mockResolvedValue(new Response(png));
    const { json } = await runCommand(Fetch, [URL_, "--json"]);
    const { body, bodyEncoding } = json as Record<string, string>;
    expect(bodyEncoding).toBe("base64");
    expect(Buffer.from(body, "base64")).toEqual(png);

    // Text is left as it is, and unmarked.
    client.fetch.mockResolvedValue(new Response("café"));
    const text = await runCommand(Fetch, [URL_, "--json"]);
    expect(text.json).toMatchObject({ body: "café" });
    expect(text.json).not.toHaveProperty("bodyEncoding");
  });

  it("refuses a --request-timeout no timer can hold", async () => {
    const { error } = await runCommand(Fetch, [
      URL_,
      "--request-timeout",
      "3000000",
    ]);
    expect(error?.oclif?.exit).toBe(2);
    expect(error?.code).toBe("BAD_FLAG_VALUE");
    expect(server).not.toHaveBeenCalled();
  });

  it.each(["--color", "--no-color"])("accepts %s", async (flag) => {
    const { error } = await runCommand(Fetch, [URL_, "--json", flag]);
    expect(error).toBeUndefined();
  });

  it("builds the request the way curl would", async () => {
    await runCommand(Fetch, [
      URL_,
      "-d",
      '{"q":1}',
      "-H",
      "content-type: application/json",
      "-H",
      "x-trace: abc",
      "--json",
    ]);
    for (const [url, init] of [
      server.mock.calls[0],
      client.fetch.mock.calls[0],
    ]) {
      expect(url).toBe(URL_);
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe('{"q":1}');
      expect(Object.fromEntries(init?.headers as Headers)).toEqual({
        "content-type": "application/json",
        "x-trace": "abc",
      });
    }
  });

  it("exits 1 when the paid-for answer is still an error", async () => {
    client.fetch.mockResolvedValue(new Response("nope", { status: 500 }));
    const { json } = await runCommand(Fetch, [URL_, "--json"]);
    expect(json).toMatchObject({ status: 500, body: "nope" });
    expect(process.exitCode).toBe(1);
  });

  it("reports a payment sent for an answer that failed: the seller holds it", async () => {
    client.paymentFor.mockReturnValue(undefined);
    client.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      server.mockImplementation(
        async () => new Response("boom", { status: 500 }),
      );
      return paidRequest(url, init);
    });
    const { json, stderr } = await runCommand(Fetch, [URL_, "--json"]);
    expect(json).toMatchObject({
      status: 500,
      payment: { settled: false, payTo: SELLER, amountRaw: "100000" },
    });
    expect(stderr).toContain("may still redeem it");
    expect(process.exitCode).toBe(1);
  });

  it("does not say try again when the paid answer is lost", async () => {
    client.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      server.mockImplementation(async () => {
        throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
      });
      return paidRequest(url, init);
    });
    const { json } = await runCommand(Fetch, [URL_, "--json"]);
    const { error } = json as {
      error: { code: string; message: string; suggestions: string[] };
    };
    expect(error.code).toBe("OUTCOME_UNKNOWN");
    expect(error.message).toContain("the seller may redeem it");
    expect(error.suggestions.join(" ")).not.toMatch(/try again/);
  });

  it("checks --output before anything is sent", async () => {
    const { error } = await runCommand(Fetch, [
      URL_,
      "-o",
      "/no/such/directory/report.json",
    ]);
    expect(error).toMatchObject({
      code: "OUTPUT_NOT_WRITABLE",
      oclif: { exit: 2 },
    });
    expect(server).not.toHaveBeenCalled();
    expect(client.fetch).not.toHaveBeenCalled();
  });

  it("writes to stdout for -o -, and makes no file called -", async () => {
    server.mockImplementation(async () => new Response("free"));
    const { error, stdout } = await runCommand(Fetch, [URL_, "-o", "-"]);
    expect(error).toBeUndefined();
    expect(stdout).toBe("free");
  });

  it("refuses a --pay-to that is not an address, before anything is sent", async () => {
    const { error } = await runCommand(Fetch, [URL_, "--pay-to", "nothex"]);
    expect(error).toMatchObject({ code: "BAD_ADDRESS", oclif: { exit: 2 } });
    expect(server).not.toHaveBeenCalled();
  });

  it("refuses a url that is not http(s)", async () => {
    const { error } = await runCommand(Fetch, ["file:///etc/passwd"]);
    expect(error).toMatchObject({ code: "BAD_URL" });
    expect(server).not.toHaveBeenCalled();
  });

  describe("where it may be real funds", () => {
    it("needs --max or --yes before anything is sent", async () => {
      for (const where of [
        ["--network", "base"],
        ["--rpc-url", "https://core.example"],
      ]) {
        const { error } = await runCommand(Fetch, [URL_, ...where]);
        expect(error).toMatchObject({
          code: "MAX_REQUIRED",
          oclif: { exit: 2 },
        });
      }
      expect(server).not.toHaveBeenCalled();
    });

    it.each([
      [["--max", "0.10 USDC"]],
      [["--yes"]],
      [["--dry-run"]],
    ])("goes ahead with %j", async (consent) => {
      const { error } = await runCommand(Fetch, [
        URL_,
        "--network",
        "base",
        "--json",
        ...consent,
      ]);
      expect(error).toBeUndefined();
      expect(server).toHaveBeenCalledOnce();
    });

    it("needs neither on a testnet, or a core on this machine", async () => {
      for (const where of [[], ["--rpc-url", "http://127.0.0.1:3000"]]) {
        const { error } = await runCommand(Fetch, [URL_, "--json", ...where]);
        expect(error).toBeUndefined();
      }
    });
  });

  it("refuses a body on a GET before anything is sent", async () => {
    const sent = vi.fn();
    globalThis.fetch = sent;
    for (const extra of [[], ["--dry-run"]]) {
      const { error } = await runCommand(Fetch, [
        URL_,
        "-X",
        "get",
        "-d",
        "{}",
        ...extra,
      ]);
      expect(error).toMatchObject({ code: "BODY_NOT_ALLOWED" });
      expect(error?.oclif?.exit).toBe(2);
    }
    expect(client.fetch).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
  });

  it("refuses a header http does not allow", async () => {
    const { error } = await runCommand(Fetch, [URL_, "-H", "x-a: line\nbreak"]);
    expect(error).toMatchObject({ code: "BAD_HEADER" });
    expect(client.fetch).not.toHaveBeenCalled();
  });

  it("refuses a malformed header before anything is sent", async () => {
    const { error } = await runCommand(Fetch, [URL_, "-H", "no-colon"]);
    expect(error).toMatchObject({ code: "BAD_HEADER" });
    expect(client.fetch).not.toHaveBeenCalled();
  });

  describe("--dry-run", () => {
    it("shows what a url charges in 4mica credit, without a wallet", async () => {
      globalThis.fetch = vi.fn(
        async () =>
          new Response(null, {
            status: 402,
            headers: {
              "PAYMENT-REQUIRED": Buffer.from(
                JSON.stringify(required),
              ).toString("base64"),
            },
          }),
      );
      const { json } = await runCommand(Fetch, [URL_, "--dry-run", "--json"]);
      pinJson("fetch", json, "dry run");
      expect(json).toEqual({
        dryRun: true,
        status: 402,
        offers: [
          {
            network: "eip155:84532",
            asset: "0xToken",
            amountRaw: "100000",
            payTo: SELLER,
          },
        ],
      });
      expect(withSession).not.toHaveBeenCalled();
    });

    it("says so when a url asks for nothing", async () => {
      globalThis.fetch = vi.fn(async () => new Response("free"));
      const { json } = await runCommand(Fetch, [URL_, "-n", "--json"]);
      expect(json).toMatchObject({ dryRun: true, status: 200, offers: [] });
    });

    it("keeps the answer of a url that carried the request out unpaid", async () => {
      const sent = vi.fn(
        async (_url: unknown, _init?: RequestInit) =>
          new Response('{"order":7}', { status: 201 }),
      );
      globalThis.fetch = sent as typeof fetch;
      const { json } = await runCommand(Fetch, [
        URL_,
        "-d",
        '{"buy":1}',
        "--dry-run",
        "--json",
      ]);
      // The order was placed: the caller has to be able to see that.
      expect(sent.mock.calls[0][1]).toMatchObject({
        method: "POST",
        body: '{"buy":1}',
      });
      expect(json).toMatchObject({
        dryRun: true,
        status: 201,
        offers: [],
        body: '{"order":7}',
      });
      expect(process.exitCode).toBeUndefined();
    });

    it("warns before it sends a request that is not a GET", async () => {
      globalThis.fetch = vi.fn(async () => new Response("ok"));
      const post = await runCommand(Fetch, [URL_, "-d", "{}", "-n"]);
      expect(post.stderr).toContain("--dry-run still sends this POST once");
      const get = await runCommand(Fetch, [URL_, "-n"]);
      expect(get.stderr).not.toContain("still sends");
    });

    it("writes that answer where the real request would", async () => {
      globalThis.fetch = vi.fn(async () => new Response("free"));
      const { stdout } = await runCommand(Fetch, [URL_, "--dry-run"]);
      expect(stdout).toBe("free");
    });

    it("exits 1 when the unpaid answer is an error other than 402", async () => {
      globalThis.fetch = vi.fn(
        async () => new Response("gone", { status: 404 }),
      );
      const { json } = await runCommand(Fetch, [URL_, "--dry-run", "--json"]);
      expect(json).toMatchObject({ dryRun: true, status: 404, body: "gone" });
      expect(process.exitCode).toBe(1);
    });

    it("does not claim that nothing is sent", () => {
      expect(Fetch.flags["dry-run"].summary).toContain("still sent");
      expect(Fetch.flags["dry-run"].summary).not.toContain("without sending");
    });
  });
});
