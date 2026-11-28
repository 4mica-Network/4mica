import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type SpendAccountingError,
  SpendAuthorizationError,
  SpendLimitError,
} from "@/errors";
import { type FetchContext, payingFetch, SpendLimiter } from "@/facade/fetch";
import { governanceOutcome, SpendGovernor } from "@/facade/governance";
import type { PaymentRecord } from "@/facade/models";
import { x402Protocol } from "@/facade/protocols/x402";
import { base64ToUtf8, utf8ToBase64 } from "@/x402/base64";
import { fakeClient, fakeSession, SELLER, USDC, USER } from "./helpers/facade";

const URL_ = "https://api.example.com/data";
const API = "https://api.test";

const v2Challenge = (amount = "10000") =>
  new Response("{}", {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": utf8ToBase64(
        JSON.stringify({
          x402Version: 2,
          resource: { url: URL_ },
          accepts: [
            {
              scheme: "4mica-credit",
              network: "eip155:84532",
              asset: USDC,
              amount,
              payTo: SELLER,
            },
          ],
        }),
      ),
    },
  });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const authorization = (overrides: Record<string, unknown> = {}) => ({
  id: "auth_1",
  status: "RESERVED",
  deniedReason: null,
  policyId: null,
  approvalRequestId: null,
  expiresAt: "2026-11-27T00:10:00.000Z",
  amount: "0.01",
  network: "BASE_SEPOLIA",
  assetAddress: USDC.toLowerCase(),
  ...overrides,
});

type Answer = (init?: RequestInit) => Response | Promise<Response>;

const hang: Answer = (init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });

function api(
  answers: {
    authorize?: Answer;
    poll?: Answer;
    consume?: Answer;
    release?: Answer;
  } = {},
) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchFn = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).slice(API.length);
      const method = init?.method ?? "GET";
      calls.push({
        method,
        path,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (path === "/v1/spend/authorize") {
        return answers.authorize?.(init) ?? json(authorization());
      }
      if (method === "GET") {
        return answers.poll?.(init) ?? json(authorization());
      }
      if (path.endsWith("/consume")) {
        return (
          answers.consume?.(init) ?? json(authorization({ status: "CONSUMED" }))
        );
      }
      return (
        answers.release?.(init) ?? json(authorization({ status: "RELEASED" }))
      );
    },
  );
  return { calls, fetchFn: fetchFn as unknown as typeof fetch };
}

function seller(answer: () => Response = () => new Response("ok")) {
  const calls: Request[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const request = input as Request;
    calls.push(request);
    return request.headers.has("PAYMENT-SIGNATURE") ? answer() : v2Challenge();
  });
  return { calls, fetchFn: fetchFn as unknown as typeof fetch };
}

function context(
  fetchFn: typeof fetch,
  governor: SpendGovernor | undefined,
  limiter = new SpendLimiter(),
) {
  const session = fakeSession(fakeClient());
  const records: PaymentRecord[] = [];
  const ctx: FetchContext = {
    fetchFn,
    protocols: [x402Protocol],
    sessionFor: (caip2) => (caip2 === session.caip2 ? session : undefined),
    limiter,
    governor,
    record: (_res, payment) => records.push(payment),
  };
  return { ctx, records };
}

const governor = (
  fetchFn: typeof fetch,
  options: {
    approvalTimeoutMs?: number;
    pollIntervalMs?: number;
    requestTimeoutMs?: number;
    accountingTimeoutMs?: number;
    agentId?: string;
    onAccountingError?: (error: SpendAccountingError) => void;
  } = {},
) =>
  new SpendGovernor(
    { apiKey: "4mica_sk_test", baseUrl: API, pollIntervalMs: 1, ...options },
    fetchFn,
  );

const paths = (calls: { method: string; path: string }[]) =>
  calls.map(({ method, path }) => `${method} ${path}`);

describe("governed paying fetch", () => {
  it("asks before signing and consumes with the signed reqId", async () => {
    const backend = api();
    const shop = seller();
    const { ctx, records } = context(
      shop.fetchFn,
      governor(backend.fetchFn, { agentId: "agent_1" }),
    );

    const res = await payingFetch(ctx, URL_);

    expect(await res.text()).toBe("ok");
    expect(records).toHaveLength(1);
    expect(paths(backend.calls)).toEqual([
      "POST /v1/spend/authorize",
      "POST /v1/spend/authorizations/auth_1/consume",
    ]);
    expect(backend.calls[0].body).toEqual({
      network: "BASE_SEPOLIA",
      assetAddress: USDC.toLowerCase(),
      amount: "0.01",
      payerAddress: USER,
      recipientAddress: SELLER,
      agentId: "agent_1",
    });
    const envelope = JSON.parse(
      base64ToUtf8(shop.calls[1].headers.get("PAYMENT-SIGNATURE") ?? ""),
    );
    expect(backend.calls[1].body).toEqual({
      reqId: envelope.payload.payload.req_id,
    });
  });

  it("refuses a denied payment without signing, and frees the session limit", async () => {
    const backend = api({
      authorize: () =>
        json(authorization({ status: "DENIED", deniedReason: "daily_limit" })),
    });
    const shop = seller();
    const limiter = new SpendLimiter({ total: "0.01 USDC" });
    const { ctx, records } = context(
      shop.fetchFn,
      governor(backend.fetchFn),
      limiter,
    );

    const error = await payingFetch(ctx, URL_).catch((err) => err);

    expect(error).toBeInstanceOf(SpendAuthorizationError);
    expect(error).toMatchObject({
      reason: "denied",
      deniedReason: "daily_limit",
      authorizationId: "auth_1",
    });
    expect(shop.calls).toHaveLength(1);
    expect(records).toEqual([]);
    const free = context(shop.fetchFn, undefined, limiter);
    await expect(payingFetch(free.ctx, URL_)).resolves.toBeInstanceOf(Response);
  });

  it("waits for an approval and pays once it is reserved", async () => {
    let polls = 0;
    const backend = api({
      authorize: () =>
        json(
          authorization({
            status: "PENDING_APPROVAL",
            approvalRequestId: "apr_1",
          }),
        ),
      poll: () =>
        json(
          authorization(
            ++polls < 3
              ? { status: "PENDING_APPROVAL", approvalRequestId: "apr_1" }
              : { approvalRequestId: "apr_1" },
          ),
        ),
    });
    const shop = seller();
    const { ctx, records } = context(shop.fetchFn, governor(backend.fetchFn));

    await payingFetch(ctx, URL_);

    expect(polls).toBe(3);
    expect(records).toHaveLength(1);
    expect(paths(backend.calls).at(-1)).toBe(
      "POST /v1/spend/authorizations/auth_1/consume",
    );
  });

  it("reports a rejected approval as denied", async () => {
    const backend = api({
      authorize: () => json(authorization({ status: "PENDING_APPROVAL" })),
      poll: () =>
        json(
          authorization({
            status: "DENIED",
            deniedReason: "approval_rejected",
          }),
        ),
    });
    const { ctx } = context(seller().fetchFn, governor(backend.fetchFn));

    await expect(payingFetch(ctx, URL_)).rejects.toMatchObject({
      reason: "denied",
      deniedReason: "approval_rejected",
    });
  });

  it("releases and gives up when the approval does not come in time", async () => {
    const pending = () =>
      json(
        authorization({
          status: "PENDING_APPROVAL",
          approvalRequestId: "apr_1",
        }),
      );
    const backend = api({ authorize: pending, poll: pending });
    const shop = seller();
    const { ctx } = context(
      shop.fetchFn,
      governor(backend.fetchFn, { approvalTimeoutMs: 5 }),
    );

    await expect(payingFetch(ctx, URL_)).rejects.toMatchObject({
      reason: "approval_timeout",
      approvalRequestId: "apr_1",
    });
    expect(paths(backend.calls).at(-1)).toBe(
      "POST /v1/spend/authorizations/auth_1/release",
    );
    expect(shop.calls).toHaveLength(1);
  });

  it.each([
    500, 502, 503, 400, 409,
  ])("consumes and keeps the amount counted when the seller answers %i after payment", async (status) => {
    const backend = api();
    const shop = seller(() => new Response("boom", { status }));
    const limiter = new SpendLimiter({ total: "0.01 USDC" });
    const { ctx, records } = context(
      shop.fetchFn,
      governor(backend.fetchFn),
      limiter,
    );

    const res = await payingFetch(ctx, URL_);

    expect(res.status).toBe(status);
    expect(records).toEqual([]);
    expect(paths(backend.calls)).toEqual([
      "POST /v1/spend/authorize",
      "POST /v1/spend/authorizations/auth_1/consume",
    ]);
    const envelope = JSON.parse(
      base64ToUtf8(shop.calls[1].headers.get("PAYMENT-SIGNATURE") ?? ""),
    );
    expect(backend.calls[1].body).toEqual({
      reqId: envelope.payload.payload.req_id,
    });
    const again = context(seller().fetchFn, undefined, limiter);
    await expect(payingFetch(again.ctx, URL_)).rejects.toMatchObject({
      limit: "total",
    });
  });

  it("consumes when the seller says it did not settle but the outcome is not a 402", async () => {
    const backend = api();
    const shop = seller(
      () =>
        new Response("ok", {
          headers: {
            "PAYMENT-RESPONSE": utf8ToBase64(
              JSON.stringify({ success: false }),
            ),
          },
        }),
    );
    const { ctx, records } = context(shop.fetchFn, governor(backend.fetchFn));

    await payingFetch(ctx, URL_);

    expect(records).toEqual([]);
    expect(paths(backend.calls).at(-1)).toBe(
      "POST /v1/spend/authorizations/auth_1/consume",
    );
  });

  it("releases and frees the session limit when the seller answers 402 to the payment", async () => {
    const backend = api();
    const shop = seller(() => v2Challenge());
    const limiter = new SpendLimiter({ total: "0.01 USDC" });
    const { ctx, records } = context(
      shop.fetchFn,
      governor(backend.fetchFn),
      limiter,
    );

    const res = await payingFetch(ctx, URL_);

    expect(res.status).toBe(402);
    expect(records).toEqual([]);
    expect(paths(backend.calls)).toEqual([
      "POST /v1/spend/authorize",
      "POST /v1/spend/authorizations/auth_1/release",
    ]);
    const again = context(seller().fetchFn, undefined, limiter);
    await expect(payingFetch(again.ctx, URL_)).resolves.toBeInstanceOf(
      Response,
    );
  });

  it("releases when signing fails before anything is sent", async () => {
    const backend = api();
    const shop = seller();
    const { ctx } = context(shop.fetchFn, governor(backend.fetchFn));
    const failing = {
      ...x402Protocol,
      pay: async () => {
        throw new Error("signer offline");
      },
    };
    ctx.protocols = [failing];

    await expect(payingFetch(ctx, URL_)).rejects.toThrow("signer offline");
    expect(shop.calls).toHaveLength(1);
    expect(paths(backend.calls).at(-1)).toBe(
      "POST /v1/spend/authorizations/auth_1/release",
    );
  });

  it.each([
    ["times out", new DOMException("timed out", "TimeoutError")],
    ["is aborted", new DOMException("aborted", "AbortError")],
  ])("consumes and keeps the amount counted when the paid request %s", async (_label, failure) => {
    const backend = api();
    const shop = seller(() => {
      throw failure;
    });
    const limiter = new SpendLimiter({ total: "0.01 USDC" });
    const { ctx } = context(shop.fetchFn, governor(backend.fetchFn), limiter);

    await expect(payingFetch(ctx, URL_)).rejects.toBe(failure);
    expect(paths(backend.calls)).toEqual([
      "POST /v1/spend/authorize",
      "POST /v1/spend/authorizations/auth_1/consume",
    ]);
    const again = context(seller().fetchFn, undefined, limiter);
    await expect(payingFetch(again.ctx, URL_)).rejects.toMatchObject({
      limit: "total",
    });
  });

  it("consumes with the signed reqId when the paid request throws", async () => {
    const backend = api();
    const shop = seller(() => {
      throw new TypeError("network down");
    });
    const { ctx } = context(shop.fetchFn, governor(backend.fetchFn));

    await expect(payingFetch(ctx, URL_)).rejects.toThrow("network down");
    expect(paths(backend.calls).at(-1)).toBe(
      "POST /v1/spend/authorizations/auth_1/consume",
    );
    const envelope = JSON.parse(
      base64ToUtf8(shop.calls[1].headers.get("PAYMENT-SIGNATURE") ?? ""),
    );
    expect(backend.calls.at(-1)?.body).toEqual({
      reqId: envelope.payload.payload.req_id,
    });
  });

  it("fails closed when the API refuses the request", async () => {
    const backend = api({
      authorize: () =>
        json({ error: "payer_not_owned", message: "not your wallet" }, 403),
    });
    const shop = seller();
    const { ctx } = context(shop.fetchFn, governor(backend.fetchFn));

    await expect(payingFetch(ctx, URL_)).rejects.toMatchObject({
      status: 403,
      code: "payer_not_owned",
    });
    expect(shop.calls).toHaveLength(1);
  });

  it("keeps the session limits ahead of the API", async () => {
    const backend = api();
    const { ctx } = context(
      seller().fetchFn,
      governor(backend.fetchFn),
      new SpendLimiter({ perPayment: "0.001 USDC" }),
    );

    await expect(payingFetch(ctx, URL_)).rejects.toBeInstanceOf(
      SpendLimitError,
    );
    expect(backend.calls).toEqual([]);
  });
});

async function settle<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  while (!done) {
    await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(1_000);
  }
  return promise;
}

const consumes = (calls: { method: string; path: string }[]) =>
  paths(calls).filter((call) => call.endsWith("/consume"));

describe("governance accounting", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const fakeTimers = () =>
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

  it("reports the consume as recorded when it succeeds first time", async () => {
    const backend = api();
    const onAccountingError = vi.fn();
    const { ctx } = context(
      seller().fetchFn,
      governor(backend.fetchFn, { onAccountingError }),
    );

    const res = await payingFetch(ctx, URL_);

    expect(governanceOutcome(res)).toEqual({
      authorizationId: "auth_1",
      accounting: "recorded",
    });
    expect(consumes(backend.calls)).toHaveLength(1);
    expect(onAccountingError).not.toHaveBeenCalled();
  });

  it.each([
    ["a 503", () => json({ error: "unavailable" }, 503)],
    ["a 429", () => json({ error: "rate_limited" }, 429)],
    [
      "a network error",
      () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])("retries the consume after %s and records it", async (_label, failure) => {
    fakeTimers();
    let attempts = 0;
    const backend = api({
      consume: () =>
        ++attempts < 3
          ? failure()
          : json(authorization({ status: "CONSUMED" })),
    });
    const onAccountingError = vi.fn();
    const { ctx, records } = context(
      seller().fetchFn,
      governor(backend.fetchFn, { onAccountingError }),
    );

    const res = await settle(payingFetch(ctx, URL_));

    expect(attempts).toBe(3);
    const bodies = backend.calls
      .filter((call) => call.path.endsWith("/consume"))
      .map((call) => call.body);
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    expect(governanceOutcome(res)?.accounting).toBe("recorded");
    expect(records).toHaveLength(1);
    expect(onAccountingError).not.toHaveBeenCalled();
  });

  it("gives up after three transient failures and reports it", async () => {
    fakeTimers();
    const backend = api({
      consume: () => json({ error: "unavailable" }, 503),
    });
    const onAccountingError = vi.fn();
    const { ctx } = context(
      seller().fetchFn,
      governor(backend.fetchFn, { onAccountingError }),
    );

    const res = await settle(payingFetch(ctx, URL_));

    expect(consumes(backend.calls)).toHaveLength(3);
    expect(await res.text()).toBe("ok");
    expect(governanceOutcome(res)?.accounting).toBe("failed");
    expect(onAccountingError).toHaveBeenCalledTimes(1);
    expect(onAccountingError.mock.calls[0][0]).toMatchObject({
      name: "SpendAccountingError",
      transition: "consume",
      authorizationId: "auth_1",
      accounting: "failed",
      cause: { status: 503 },
    });
  });

  it("returns the paid response even when the accounting callback throws", async () => {
    const backend = api({
      consume: () => json({ error: "conflict" }, 409),
    });
    const paidResponse = new Response("ok");
    const { ctx } = context(
      seller(() => paidResponse).fetchFn,
      governor(backend.fetchFn, {
        onAccountingError: () => {
          throw new Error("callback bug");
        },
      }),
    );

    const res = await payingFetch(ctx, URL_);

    expect(res).toBe(paidResponse);
    expect(governanceOutcome(res)).toEqual({
      authorizationId: "auth_1",
      accounting: "failed",
    });
  });

  it.each([
    400, 404, 409,
  ])("does not retry a %i, reports it, and still returns the paid response", async (status) => {
    const backend = api({
      consume: () => json({ error: "conflict" }, status),
    });
    const onAccountingError = vi.fn();
    const paidResponse = new Response("ok");
    const shop = seller(() => paidResponse);
    const { ctx, records } = context(
      shop.fetchFn,
      governor(backend.fetchFn, { onAccountingError }),
    );

    const res = await payingFetch(ctx, URL_);

    expect(res).toBe(paidResponse);
    expect(await res.text()).toBe("ok");
    expect(records).toHaveLength(1);
    expect(consumes(backend.calls)).toHaveLength(1);
    expect(governanceOutcome(res)).toEqual({
      authorizationId: "auth_1",
      accounting: "failed",
    });
    expect(onAccountingError).toHaveBeenCalledTimes(1);
    const error = onAccountingError.mock.calls[0][0] as SpendAccountingError;
    expect(error.accounting).toBe("failed");
    const envelope = JSON.parse(
      base64ToUtf8(shop.calls[1].headers.get("PAYMENT-SIGNATURE") ?? ""),
    );
    expect(error.reqId).toBe(envelope.payload.payload.req_id);
  });

  it("keeps retrying the consume after the caller aborts once the payment was sent", async () => {
    fakeTimers();
    const controller = new AbortController();
    let attempts = 0;
    const backend = api({
      consume: () => {
        controller.abort();
        return ++attempts < 2
          ? json({ error: "unavailable" }, 503)
          : json(authorization({ status: "CONSUMED" }));
      },
    });
    const onAccountingError = vi.fn();
    const { ctx } = context(
      seller().fetchFn,
      governor(backend.fetchFn, { onAccountingError }),
    );

    const res = await settle(
      payingFetch(ctx, URL_, { signal: controller.signal }),
    );

    expect(await res.text()).toBe("ok");
    expect(consumes(backend.calls)).toHaveLength(2);
    expect(governanceOutcome(res)?.accounting).toBe("recorded");
    expect(onAccountingError).not.toHaveBeenCalled();
  });

  it("reports a failed consume when the paid request itself throws", async () => {
    const backend = api({
      consume: () => json({ error: "forbidden" }, 403),
    });
    const onAccountingError = vi.fn();
    const shop = seller(() => {
      throw new TypeError("network down");
    });
    const { ctx } = context(
      shop.fetchFn,
      governor(backend.fetchFn, { onAccountingError }),
    );

    await expect(payingFetch(ctx, URL_)).rejects.toThrow("network down");
    expect(onAccountingError).toHaveBeenCalledTimes(1);
    expect(onAccountingError.mock.calls[0][0]).toMatchObject({
      transition: "consume",
      accounting: "failed",
    });
  });

  it("reports a release that keeps failing after a 402", async () => {
    fakeTimers();
    const backend = api({
      release: () => json({ error: "unavailable" }, 502),
    });
    const onAccountingError = vi.fn();
    const { ctx } = context(
      seller(() => v2Challenge()).fetchFn,
      governor(backend.fetchFn, { onAccountingError }),
    );

    const res = await settle(payingFetch(ctx, URL_));

    expect(res.status).toBe(402);
    expect(
      paths(backend.calls).filter((call) => call.endsWith("/release")),
    ).toHaveLength(3);
    expect(governanceOutcome(res)?.accounting).toBe("failed");
    expect(onAccountingError.mock.calls[0][0]).toMatchObject({
      transition: "release",
      accounting: "failed",
    });
  });

  it("records no outcome without governance", async () => {
    const { ctx } = context(seller().fetchFn, undefined);

    const res = await payingFetch(ctx, URL_);

    expect(governanceOutcome(res)).toBeUndefined();
  });
});

describe("cancellation and deadlines", () => {
  const PENDING = () =>
    json(
      authorization({
        status: "PENDING_APPROVAL",
        approvalRequestId: "apr_1",
      }),
    );

  const releases = (calls: { method: string; path: string }[]) =>
    paths(calls).filter((call) => call.endsWith("/release"));

  const timed = async <T>(promise: Promise<T>) => {
    const started = Date.now();
    const outcome = await promise.then(
      (value) => ({ value, error: undefined as unknown }),
      (error: unknown) => ({ value: undefined, error }),
    );
    return { ...outcome, elapsed: Date.now() - started };
  };

  it("abandons the authorize request when the caller aborts, without signing", async () => {
    const controller = new AbortController();
    const backend = api({
      authorize: (init) => {
        queueMicrotask(() => controller.abort());
        return hang(init);
      },
    });
    const shop = seller();
    const limiter = new SpendLimiter({ total: "0.01 USDC" });
    const { ctx } = context(shop.fetchFn, governor(backend.fetchFn), limiter);

    const { error, elapsed } = await timed(
      payingFetch(ctx, URL_, { signal: controller.signal }),
    );

    expect(error).toMatchObject({ name: "AbortError" });
    expect(elapsed).toBeLessThan(1_000);
    expect(shop.calls).toHaveLength(1);
    expect(paths(backend.calls)).toEqual(["POST /v1/spend/authorize"]);
    const again = context(seller().fetchFn, undefined, limiter);
    expect((await payingFetch(again.ctx, URL_)).ok).toBe(true);
  });

  it("bounds a hanging authorize request by requestTimeoutMs", async () => {
    const backend = api({ authorize: hang });
    const { ctx } = context(
      seller().fetchFn,
      governor(backend.fetchFn, { requestTimeoutMs: 50 }),
    );

    const { error, elapsed } = await timed(payingFetch(ctx, URL_));

    expect(error).toMatchObject({
      name: "AppError",
      message: "governance request timed out after 50ms",
    });
    expect(elapsed).toBeLessThan(1_000);
  });

  it("stops waiting between polls and releases the pending approval when the caller aborts", async () => {
    const controller = new AbortController();
    const backend = api({
      authorize: () => {
        setTimeout(() => controller.abort(), 20);
        return PENDING();
      },
      poll: PENDING,
    });
    const shop = seller();
    const { ctx } = context(
      shop.fetchFn,
      governor(backend.fetchFn, { pollIntervalMs: 60_000 }),
    );

    const { error, elapsed } = await timed(
      payingFetch(ctx, URL_, { signal: controller.signal }),
    );

    expect(error).toMatchObject({ name: "AbortError" });
    expect(elapsed).toBeLessThan(1_000);
    expect(paths(backend.calls)).toEqual([
      "POST /v1/spend/authorize",
      "POST /v1/spend/authorizations/auth_1/release",
    ]);
    expect(shop.calls).toHaveLength(1);
  });

  it("abandons a poll request and releases when the caller aborts during it", async () => {
    const controller = new AbortController();
    const backend = api({
      authorize: PENDING,
      poll: (init) => {
        queueMicrotask(() => controller.abort());
        return hang(init);
      },
    });
    const { ctx } = context(seller().fetchFn, governor(backend.fetchFn));

    const { error, elapsed } = await timed(
      payingFetch(ctx, URL_, { signal: controller.signal }),
    );

    expect(error).toMatchObject({ name: "AbortError" });
    expect(elapsed).toBeLessThan(1_000);
    expect(paths(backend.calls)).toEqual([
      "POST /v1/spend/authorize",
      "GET /v1/spend/authorizations/auth_1",
      "POST /v1/spend/authorizations/auth_1/release",
    ]);
  });

  it("ends a hanging poll at the approval deadline, not the request timeout", async () => {
    const backend = api({ authorize: PENDING, poll: hang });
    const { ctx } = context(
      seller().fetchFn,
      governor(backend.fetchFn, {
        approvalTimeoutMs: 80,
        requestTimeoutMs: 60_000,
      }),
    );

    const { error, elapsed } = await timed(payingFetch(ctx, URL_));

    expect(error).toMatchObject({
      reason: "approval_timeout",
      approvalRequestId: "apr_1",
    });
    expect(elapsed).toBeLessThan(1_000);
    expect(releases(backend.calls)).toHaveLength(1);
  });

  it("releases a reservation granted after the caller aborted", async () => {
    const controller = new AbortController();
    const backend = api({
      authorize: PENDING,
      poll: () => {
        controller.abort();
        return json(authorization());
      },
    });
    const shop = seller();
    const { ctx } = context(shop.fetchFn, governor(backend.fetchFn));

    const { error } = await timed(
      payingFetch(ctx, URL_, { signal: controller.signal }),
    );

    expect(error).toMatchObject({ name: "AbortError" });
    expect(releases(backend.calls)).toHaveLength(1);
    expect(shop.calls).toHaveLength(1);
  });

  it("bounds the cleanup release by accountingTimeoutMs", async () => {
    const controller = new AbortController();
    const backend = api({
      authorize: () => {
        setTimeout(() => controller.abort(), 10);
        return PENDING();
      },
      poll: PENDING,
      release: hang,
    });
    const { ctx } = context(
      seller().fetchFn,
      governor(backend.fetchFn, {
        pollIntervalMs: 60_000,
        accountingTimeoutMs: 80,
      }),
    );

    const { error, elapsed } = await timed(
      payingFetch(ctx, URL_, { signal: controller.signal }),
    );

    expect(error).toMatchObject({ name: "AbortError" });
    expect(elapsed).toBeLessThan(1_000);
    expect(releases(backend.calls)).toHaveLength(1);
  });

  it("consumes after the caller aborts mid-payment, independent of its signal", async () => {
    const controller = new AbortController();
    const backend = api();
    const shop = seller(() => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    const { ctx } = context(shop.fetchFn, governor(backend.fetchFn));

    const { error } = await timed(
      payingFetch(ctx, URL_, { signal: controller.signal }),
    );

    expect(error).toMatchObject({ name: "AbortError" });
    expect(consumes(backend.calls)).toHaveLength(1);
    expect(releases(backend.calls)).toHaveLength(0);
  });

  it("reports the consume as pending when it outlasts accountingTimeoutMs", async () => {
    const onAccountingError = vi.fn();
    const backend = api({ consume: hang });
    const { ctx } = context(
      seller().fetchFn,
      governor(backend.fetchFn, {
        accountingTimeoutMs: 80,
        requestTimeoutMs: 60_000,
        onAccountingError,
      }),
    );

    const { value, elapsed } = await timed(payingFetch(ctx, URL_));

    expect(elapsed).toBeLessThan(1_000);
    expect(value && governanceOutcome(value)?.accounting).toBe("pending");
    expect(onAccountingError.mock.calls[0][0]).toMatchObject({
      transition: "consume",
      accounting: "pending",
    });
  });

  it("refuses to start for a caller that has already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const backend = api();
    const { ctx } = context(seller().fetchFn, governor(backend.fetchFn));

    await expect(
      payingFetch(ctx, URL_, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(backend.calls).toEqual([]);
  });
});
