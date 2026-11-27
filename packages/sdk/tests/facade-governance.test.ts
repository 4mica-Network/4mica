import { describe, expect, it, vi } from "vitest";
import { SpendAuthorizationError, SpendLimitError } from "@/errors";
import { type FetchContext, payingFetch, SpendLimiter } from "@/facade/fetch";
import { SpendGovernor } from "@/facade/governance";
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

function api(
  answers: { authorize?: () => Response; poll?: () => Response } = {},
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
        return answers.authorize?.() ?? json(authorization());
      }
      if (method === "GET") {
        return answers.poll?.() ?? json(authorization());
      }
      if (path.endsWith("/consume")) {
        return json(authorization({ status: "CONSUMED" }));
      }
      return json(authorization({ status: "RELEASED" }));
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
  options: { approvalTimeoutMs?: number; agentId?: string } = {},
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

  it("releases when the seller does not take the payment", async () => {
    const backend = api();
    const shop = seller(() => new Response("boom", { status: 500 }));
    const { ctx, records } = context(shop.fetchFn, governor(backend.fetchFn));

    const res = await payingFetch(ctx, URL_);

    expect(res.status).toBe(500);
    expect(records).toEqual([]);
    expect(paths(backend.calls).at(-1)).toBe(
      "POST /v1/spend/authorizations/auth_1/release",
    );
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

  it("ignores a failed consume once the seller has delivered", async () => {
    const backend = api();
    const failing = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) =>
        String(input).endsWith("/consume")
          ? json({ error: "conflict" }, 409)
          : backend.fetchFn(input, init),
    ) as unknown as typeof fetch;
    const { ctx, records } = context(seller().fetchFn, governor(failing));

    const res = await payingFetch(ctx, URL_);

    expect(res.ok).toBe(true);
    expect(records).toHaveLength(1);
  });
});
