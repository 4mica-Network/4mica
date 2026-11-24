import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withSession } from "../core/session.js";
import { runCommand } from "../test/run.js";
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
beforeEach(() => {
  process.exitCode = undefined;
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
      "0xSeller",
      "--json",
    ]);
    expect(withSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function),
      { perPayment: ["0.50 USDC"], payTo: ["0xSeller"] },
    );
  });

  it("returns the body and what was paid", async () => {
    const { json } = await runCommand(Fetch, [URL_, "--json"]);
    expect(json).toMatchObject({
      status: 200,
      body: '{"report":1}',
      payment: { amount: "0.1", amountRaw: "100000", payTo: "0xSeller" },
    });
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
    expect(client.fetch).not.toHaveBeenCalled();
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
    const [url, init] = client.fetch.mock.calls[0];
    expect(url).toBe(URL_);
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"q":1}');
    expect(Object.fromEntries(init.headers)).toEqual({
      "content-type": "application/json",
      "x-trace": "abc",
    });
  });

  it("exits 1 when the paid-for answer is still an error", async () => {
    client.fetch.mockResolvedValue(new Response("nope", { status: 500 }));
    const { json } = await runCommand(Fetch, [URL_, "--json"]);
    expect(json).toMatchObject({ status: 500, body: "nope" });
    expect(process.exitCode).toBe(1);
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
    const required = {
      x402Version: 2,
      accepts: [
        { scheme: "exact", network: "eip155:8453", amount: "1", payTo: "0xA" },
        {
          scheme: "4mica-credit",
          network: "eip155:84532",
          asset: "0xToken",
          amount: "100000",
          payTo: "0xSeller",
        },
      ],
    };

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
      expect(json).toEqual({
        dryRun: true,
        status: 402,
        offers: [
          {
            network: "eip155:84532",
            asset: "0xToken",
            amountRaw: "100000",
            payTo: "0xSeller",
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

    it("writes that answer where the real request would", async () => {
      globalThis.fetch = vi.fn(async () => new Response("free"));
      const written = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      await runCommand(Fetch, [URL_, "--dry-run"]);
      expect(written).toHaveBeenCalledWith(Buffer.from("free"));
      written.mockRestore();
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
