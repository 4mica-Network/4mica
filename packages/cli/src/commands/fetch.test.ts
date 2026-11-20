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
      expect(json).toEqual({ dryRun: true, status: 200, offers: [] });
    });
  });
});
