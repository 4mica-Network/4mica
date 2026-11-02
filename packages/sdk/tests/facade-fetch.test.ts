import { describe, expect, it, vi } from "vitest";
import { SpendLimitError } from "@/errors";
import { type FetchContext, payingFetch, SpendLimiter } from "@/facade/fetch";
import type { PaymentRecord } from "@/facade/models";
import type { PaymentProtocol, PaymentTerms } from "@/facade/protocols/types";
import { x402Protocol } from "@/facade/protocols/x402";
import { base64ToUtf8, utf8ToBase64 } from "@/x402/base64";
import {
  fakeClient,
  fakeSession,
  SELLER,
  USDC,
  USDT,
  USER,
} from "./helpers/facade";

const URL_ = "https://api.example.com/data";

const entry = (overrides: Record<string, unknown> = {}) => ({
  scheme: "4mica-credit",
  network: "eip155:84532",
  asset: USDC,
  amount: "10000",
  payTo: SELLER,
  ...overrides,
});

const v2Challenge = (accepts: unknown[]) =>
  new Response("{}", {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": utf8ToBase64(
        JSON.stringify({
          x402Version: 2,
          resource: { url: URL_ },
          accepts,
        }),
      ),
    },
  });

const v1Challenge = (accepts: unknown[]) =>
  new Response(JSON.stringify({ x402Version: 1, accepts }), {
    status: 402,
    headers: { "content-type": "application/json" },
  });

function seller(challenge: () => Response) {
  const calls: Request[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const request = input as Request;
    calls.push(request);
    const paid =
      request.headers.has("PAYMENT-SIGNATURE") ||
      request.headers.has("X-PAYMENT");
    return paid ? new Response("ok") : challenge();
  });
  return { calls, fetchFn: fetchFn as unknown as typeof fetch };
}

function context(
  fetchFn: typeof fetch,
  options: {
    protocols?: PaymentProtocol[];
    limiter?: SpendLimiter;
    fake?: ReturnType<typeof fakeClient>;
  } = {},
) {
  const session = fakeSession(options.fake ?? fakeClient());
  const records: PaymentRecord[] = [];
  const ctx: FetchContext = {
    fetchFn,
    protocols: options.protocols ?? [x402Protocol],
    sessionFor: (caip2) => (caip2 === session.caip2 ? session : undefined),
    limiter: options.limiter ?? new SpendLimiter(),
    record: (_res, payment) => records.push(payment),
  };
  return { ctx, records, session };
}

describe("x402 adapter", () => {
  it("reads 4mica-credit terms from a v2 header and skips other schemes", async () => {
    const terms = await x402Protocol.terms(
      v2Challenge([entry({ scheme: "exact" }), entry()]),
    );
    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({
      protocol: "x402",
      network: "eip155:84532",
      asset: USDC,
      amount: 10_000n,
      payTo: SELLER,
    });
  });

  it("reads v1 bodies with either amount field, and normalizes shorthand networks", async () => {
    const terms = await x402Protocol.terms(
      v1Challenge([
        entry({
          amount: undefined,
          maxAmountRequired: "5",
          network: "base-sepolia",
        }),
        entry(),
      ]),
    );
    expect(terms.map((t) => [t.amount, t.network])).toEqual([
      [5n, "eip155:84532"],
      [10_000n, "eip155:84532"],
    ]);
  });

  it("ignores responses that are not x402", async () => {
    expect(
      await x402Protocol.terms(new Response("nope", { status: 402 })),
    ).toEqual([]);
    expect(
      await x402Protocol.terms(
        new Response("{}", {
          status: 402,
          headers: { "PAYMENT-REQUIRED": "!!not base64!!" },
        }),
      ),
    ).toEqual([]);
  });

  it("pays v2 in PAYMENT-SIGNATURE and v1 in X-PAYMENT", async () => {
    const fake = fakeClient();
    const [v2] = await x402Protocol.terms(v2Challenge([entry()]));
    const v2Headers = await x402Protocol.pay(v2, fake.asClient);
    const v2Envelope = JSON.parse(base64ToUtf8(v2Headers["PAYMENT-SIGNATURE"]));
    expect(v2Envelope.x402Version).toBe(2);
    expect(v2Envelope.accepted.payTo).toBe(SELLER);
    expect(v2Envelope.payload.payload.user_address.toLowerCase()).toBe(
      USER.toLowerCase(),
    );

    const [v1] = await x402Protocol.terms(v1Challenge([entry()]));
    const v1Headers = await x402Protocol.pay(v1, fake.asClient);
    const v1Envelope = JSON.parse(base64ToUtf8(v1Headers["X-PAYMENT"]));
    expect(v1Envelope).toMatchObject({
      x402Version: 1,
      scheme: "4mica-credit",
    });
  });
});

describe("paying fetch", () => {
  it("passes non-402 responses through without paying", async () => {
    const fetchFn = vi.fn(
      async () => new Response("free"),
    ) as unknown as typeof fetch;
    const { ctx, records } = context(fetchFn);
    const res = await payingFetch(ctx, URL_);
    expect(await res.text()).toBe("free");
    expect(records).toEqual([]);
  });

  it("passes a 402 it cannot pay through untouched", async () => {
    const { fetchFn, calls } = seller(() =>
      v2Challenge([entry({ network: "eip155:8453" })]),
    );
    const { ctx } = context(fetchFn);
    const res = await payingFetch(ctx, URL_);
    expect(res.status).toBe(402);
    expect(calls).toHaveLength(1);
  });

  it("pays once, retries once with the same request, and records it", async () => {
    const { fetchFn, calls } = seller(() => v2Challenge([entry()]));
    const { ctx, records } = context(fetchFn);
    const res = await payingFetch(ctx, URL_, {
      method: "POST",
      body: "payload",
      headers: { "x-app": "1" },
    });
    expect(await res.text()).toBe("ok");
    expect(calls).toHaveLength(2);
    expect(calls[1].method).toBe("POST");
    expect(calls[1].headers.get("x-app")).toBe("1");
    expect(await calls[1].text()).toBe("payload");
    expect(records).toEqual([
      {
        protocol: "x402",
        network: "eip155:84532",
        asset: { symbol: "USDC", address: USDC, decimals: 6 },
        amount: "0.01",
        amountRaw: 10_000n,
        payTo: SELLER,
      },
    ]);
  });

  it("never loops on a second 402, and does not count it", async () => {
    const challenge = () => v2Challenge([entry({ amount: "600000" })]);
    const fetchFn = vi.fn(async () => challenge()) as unknown as typeof fetch;
    const limiter = new SpendLimiter({ total: "1 USDC" });
    const { ctx, records } = context(fetchFn, { limiter });
    const res = await payingFetch(ctx, URL_);
    expect(res.status).toBe(402);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(records).toEqual([]);
    // Released: a 0.6 USDC payment still fits the 1 USDC total.
    const ok = seller(challenge);
    await payingFetch({ ...ctx, fetchFn: ok.fetchFn }, URL_);
    expect(ok.calls).toHaveLength(2);
  });

  it("refuses over the default 1 USDC per payment, signing nothing", async () => {
    const { fetchFn, calls } = seller(() =>
      v2Challenge([entry({ amount: "2000000" })]),
    );
    const fake = fakeClient();
    const { ctx } = context(fetchFn, { fake });
    await expect(payingFetch(ctx, URL_)).rejects.toMatchObject({
      limit: "perPayment",
    });
    expect(calls).toHaveLength(1);
    expect(fake.client.signPayment).not.toHaveBeenCalled();
  });

  it("refuses assets no perPayment limit names, and payees not allowed", async () => {
    const usdt = seller(() => v2Challenge([entry({ asset: USDT })]));
    await expect(
      payingFetch(context(usdt.fetchFn).ctx, URL_),
    ).rejects.toMatchObject({ limit: "assets" });

    const other = seller(() => v2Challenge([entry()]));
    const limiter = new SpendLimiter({ payTo: [USER] });
    await expect(
      payingFetch(context(other.fetchFn, { limiter }).ctx, URL_),
    ).rejects.toMatchObject({ limit: "payTo" });
  });

  it("enforces the session total across payments", async () => {
    const { fetchFn } = seller(() =>
      v2Challenge([entry({ amount: "400000" })]),
    );
    const limiter = new SpendLimiter({ total: "1 USDC" });
    const { ctx } = context(fetchFn, { limiter });
    await payingFetch(ctx, URL_);
    await payingFetch(ctx, URL_);
    await expect(payingFetch(ctx, URL_)).rejects.toThrow(SpendLimitError);
  });

  it("holds the session total when payments run concurrently", async () => {
    const { fetchFn } = seller(() =>
      v2Challenge([entry({ amount: "400000" })]),
    );
    const limiter = new SpendLimiter({ total: "1 USDC" });
    const { ctx } = context(fetchFn, { limiter });
    const results = await Promise.allSettled(
      [1, 2, 3].map(() => payingFetch(ctx, URL_)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([
      "fulfilled",
      "fulfilled",
      "rejected",
    ]);
  });

  it("allows a second asset when perPayment names it", async () => {
    const { fetchFn, calls } = seller(() =>
      v2Challenge([entry({ asset: USDT })]),
    );
    const limiter = new SpendLimiter({ perPayment: ["1 USDC", "2 USDT"] });
    await payingFetch(context(fetchFn, { limiter }).ctx, URL_);
    expect(calls).toHaveLength(2);
  });

  describe("with a second protocol", () => {
    const fakeProtocol = (name: string, amount: bigint): PaymentProtocol => ({
      name,
      terms: async () => [
        {
          protocol: name,
          network: "eip155:84532",
          asset: USDC,
          amount,
          payTo: SELLER,
          offer: undefined,
        } satisfies PaymentTerms,
      ],
      pay: vi.fn(async () => ({ "X-PAYMENT": name })),
    });

    it("prefers protocols in the given order", async () => {
      const first = fakeProtocol("first", 10n);
      const second = fakeProtocol("second", 10n);
      const { fetchFn } = seller(() => new Response("", { status: 402 }));
      const { ctx, records } = context(fetchFn, {
        protocols: [second, first],
      });
      await payingFetch(ctx, URL_);
      expect(records[0].protocol).toBe("second");
      expect(first.pay).not.toHaveBeenCalled();
    });

    it("falls back to the next option when the first breaks a limit", async () => {
      const pricey = fakeProtocol("pricey", 5_000_000n);
      const cheap = fakeProtocol("cheap", 10n);
      const { fetchFn } = seller(() => new Response("", { status: 402 }));
      const { ctx, records } = context(fetchFn, {
        protocols: [pricey, cheap],
      });
      await payingFetch(ctx, URL_);
      expect(records[0].protocol).toBe("cheap");
      expect(pricey.pay).not.toHaveBeenCalled();
    });
  });

  it("rejects malformed limits up front", () => {
    expect(() => new SpendLimiter({ perPayment: "1" })).toThrow();
    expect(() => new SpendLimiter({ total: 5 as never })).toThrow();
  });
});
