import { describe, expect, it, vi } from "vitest";
import { RpcError } from "@/errors";
import {
  CheckpointPayload,
  PaymentRequest,
  PaymentRequestPayload,
  SignedCheckpoint,
} from "@/models";
import type { FetchFn } from "@/rpc";
import { RpcProxy } from "@/rpc";

const PARAMS = {
  guarantee_signer: "0x0000000000000000000000000000000000005164",
  contract_address: "0x1234567890abcdef1234567890abcdef12345678",
  guarantee_registry_address: "0x0000000000000000000000000000000000065e61",
  clearing_house_address: "0x00000000000000000000000000000000c1ea4111",
  ethereum_http_rpc_url: "http://localhost:8545",
  eip712_name: "4micaClearingHouse",
  eip712_version: "1",
  chain_id: 1337,
  supported_payment_payload_versions: [1],
};

const ZERO = "0x0000000000000000000000000000000000000000";
const PAYER = "0x1234567890123456789012345678901234567890";

const request = () =>
  new PaymentRequest(
    PaymentRequestPayload.new({
      userAddress: PAYER,
      recipientAddress: "0x00000000000000000000000000000000000000Be",
      cycleId: `0x${"11".repeat(32)}`,
      reqId: 7n,
      amount: 1_000n,
      timestamp: 1_700_000_000,
      salt: `0x${"22".repeat(32)}`,
    }),
    `0x${"ab".repeat(65)}`,
  );

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("RpcProxy", () => {
  it("round trips public params without credentials", async () => {
    const fetchMock = vi.fn<FetchFn>(async (input, init) => {
      const url = input.toString();
      expect(url.endsWith("/core/public-params")).toBe(true);
      const headers = init?.headers as Record<string, string>;
      // Bootstrap routes are public; they must never carry Authorization.
      expect(headers.Authorization).toBeUndefined();
      return new Response(JSON.stringify(PARAMS), { status: 200 });
    });

    const proxy = new RpcProxy("http://example.com", fetchMock).withBearerToken(
      "token",
    );
    const got = await proxy.getPublicParams();
    expect(got.chainId).toBe(1337);
    expect(got.contractAddress).toBe(PARAMS.contract_address);
    expect(got.clearingHouseAddress).toBe(PARAMS.clearing_house_address);
    expect(got.guaranteeSigner).toBe(PARAMS.guarantee_signer);
    expect(got.supportedPaymentPayloadVersions).toEqual([1]);
  });

  it("gets supported tokens", async () => {
    const payload = {
      chain_id: 84532,
      tokens: [
        {
          symbol: "USDC",
          address: "0x0000000000000000000000000000000000000001",
          decimals: 6,
          domain_separator: `0x${"22".repeat(32)}`,
        },
      ],
    };
    const fetchMock = vi.fn<FetchFn>(async (input) => {
      expect(input.toString().endsWith("/core/tokens")).toBe(true);
      return new Response(JSON.stringify(payload), { status: 200 });
    });

    const proxy = new RpcProxy("http://example.com", fetchMock);
    const got = await proxy.getSupportedTokens();
    expect(got.chainId).toBe(84532);
    expect(got.tokens[0]?.domainSeparator).toBe(`0x${"22".repeat(32)}`);
  });

  it("posts the signed request and parses the receipt", async () => {
    let body: unknown;
    const fetchMock = vi.fn<FetchFn>(async (input, init) => {
      expect(input.toString().endsWith("/core/guarantees")).toBe(true);
      expect(init?.method).toBe("POST");
      body = JSON.parse(String(init?.body));
      return json({ receipt: "0x00aa", signature: "0xbb" });
    });
    const proxy = new RpcProxy("http://example.com", fetchMock);
    const receipt = await proxy.issueGuarantee(request());
    expect(body).toEqual(request().toPayload());
    expect(receipt.receipt).toBe("0x00aa");
    expect(receipt.signature).toBe("0xbb");
  });

  it("relays a request already in wire form", async () => {
    // What a seller's paywall forwards from the X-PAYMENT header.
    let body: unknown;
    const fetchMock = vi.fn<FetchFn>(async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return json({ receipt: "0x00aa", signature: "0xbb" });
    });
    await new RpcProxy("http://example.com", fetchMock).issueGuarantee(
      request().toPayload(),
    );
    expect(body).toEqual(request().toPayload());
  });

  it("carries core's code and details on a coded refusal", async () => {
    const fetchMock = vi.fn<FetchFn>(async () =>
      json(
        {
          error: "payer must submit a checkpoint",
          code: "CHECKPOINT_REQUIRED",
          details: { uncheckpointed: 64 },
        },
        409,
      ),
    );
    const err = await new RpcProxy("http://example.com", fetchMock)
      .issueGuarantee(request())
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect(err).toMatchObject({
      status: 409,
      code: "CHECKPOINT_REQUIRED",
      details: { uncheckpointed: 64 },
    });
    expect(String(err)).toContain("payer must submit a checkpoint");
  });

  it("leaves an uncoded refusal without a code", async () => {
    const fetchMock = vi.fn<FetchFn>(
      async () => new Response("bad gateway", { status: 502 }),
    );
    const err = (await new RpcProxy("http://example.com", fetchMock)
      .issueGuarantee(request())
      .catch((e: unknown) => e)) as RpcError;
    expect(err.code).toBeUndefined();
    expect(err.details).toBeUndefined();
  });

  it("asks for the active cycle of an asset", async () => {
    let url = "";
    const fetchMock = vi.fn<FetchFn>(async (input) => {
      url = input.toString();
      return json({
        cycle_id: `0x${"11".repeat(32)}`,
        cycle_id_text: "t",
        asset_address: ZERO,
        period_start: 1,
        period_end: 2,
        server_time: 3,
        max_uncheckpointed: 64,
      });
    });
    const cycle = await new RpcProxy(
      "http://example.com",
      fetchMock,
    ).getActiveCycle(ZERO);
    expect(new URL(url).pathname).toBe("/core/cycles/active");
    expect(new URL(url).searchParams.get("asset")).toBe(ZERO);
    expect(cycle.serverTime).toBe(3);
    expect(cycle.maxUncheckpointed).toBe(64);
  });

  it.each([
    undefined,
    `0x${"AB".repeat(32)}`,
  ])("names payer, asset and cycle %s when reading a checkpoint batch", async (cycleId) => {
    let url = "";
    const fetchMock = vi.fn<FetchFn>(async (input) => {
      url = input.toString();
      return json({
        cycle_id: `0x${"ab".repeat(32)}`,
        cycle_id_text: "t",
        asset_address: ZERO,
        payer: PAYER,
        previous: null,
        authorizations: [],
        max_uncheckpointed: 64,
      });
    });
    await new RpcProxy("http://example.com", fetchMock).getCheckpointBatch(
      PAYER,
      ZERO,
      cycleId,
    );
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(`/core/payers/${PAYER}/checkpoint-batch`);
    expect(parsed.searchParams.get("asset")).toBe(ZERO);
    expect(parsed.searchParams.get("cycle_id")).toBe(
      cycleId === undefined ? null : `0x${"ab".repeat(32)}`,
    );
  });

  it("posts a signed checkpoint", async () => {
    let body: unknown;
    const fetchMock = vi.fn<FetchFn>(async (input, init) => {
      expect(new URL(input.toString()).pathname).toBe("/core/checkpoints");
      body = JSON.parse(String(init?.body));
      return json({
        cycle_id: `0x${"11".repeat(32)}`,
        cycle_id_text: "t",
        asset_address: ZERO,
        payer: PAYER,
        cumulative_gross: "120",
        timestamp_cutoff: 99,
        covered: 1,
      });
    });
    const signed = new SignedCheckpoint(
      new CheckpointPayload({
        payer: PAYER,
        cycleId: `0x${"11".repeat(32)}`,
        assetAddress: ZERO,
        cumulativeGross: 120n,
        timestampCutoff: 99,
      }),
      "0xcc",
    );

    const accepted = await new RpcProxy(
      "http://example.com",
      fetchMock,
    ).submitCheckpoint(signed);
    expect(body).toEqual({
      payload: {
        payer: PAYER,
        cycle_id: `0x${"11".repeat(32)}`,
        asset_address: ZERO,
        cumulative_gross: "0x78",
        timestamp_cutoff: 99,
      },
      signature: "0xcc",
    });
    expect(accepted.cumulativeGross).toBe(120n);
    expect(accepted.covered).toBe(1);
  });

  it("surfaces api errors with status and message", async () => {
    const fetchMock = vi.fn<FetchFn>(async (input) => {
      expect(input.toString()).toContain("action=claim_net_credit");
      return new Response(JSON.stringify({ error: "cycle not found" }), {
        status: 400,
      });
    });
    const proxy = new RpcProxy("http://example.com", fetchMock);
    await expect(
      proxy.getClearingClaimNetCreditAction("0xcycle", "0xcreditor"),
    ).rejects.toMatchObject({ status: 400, message: "400: cycle not found" });
  });

  it("retries GETs on retryable statuses and gives up after three attempts", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const flaky = vi.fn<FetchFn>(async () => {
        calls += 1;
        if (calls < 3) {
          return new Response(JSON.stringify({ error: "busy" }), {
            status: 503,
          });
        }
        return new Response(JSON.stringify(PARAMS), { status: 200 });
      });
      const proxy = new RpcProxy("http://example.com", flaky);
      const pending = proxy.getPublicParams();
      await vi.runAllTimersAsync();
      const got = await pending;
      expect(got.chainId).toBe(1337);
      expect(calls).toBe(3);

      calls = 0;
      const alwaysDown = vi.fn<FetchFn>(async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: "busy" }), {
          status: 503,
        });
      });
      const downProxy = new RpcProxy("http://example.com", alwaysDown);
      const failing = downProxy.getPublicParams().catch((err) => err);
      await vi.runAllTimersAsync();
      const err = await failing;
      expect(err).toBeInstanceOf(RpcError);
      expect(calls).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry GETs on non-retryable statuses", async () => {
    let calls = 0;
    const fetchMock = vi.fn<FetchFn>(async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "nope" }), { status: 404 });
    });
    const proxy = new RpcProxy("http://example.com", fetchMock);
    await expect(proxy.getSupportedTokens()).rejects.toThrow(RpcError);
    expect(calls).toBe(1);
  });

  it("returns the health report on 503 without retrying", async () => {
    // Core answers 503 with the same report body when a dependency is down.
    const report = {
      status: "unhealthy",
      db: "ok",
      chain_rpc: "unhealthy",
      settlement_timing: "ok",
    };
    let calls = 0;
    const fetchMock = vi.fn<FetchFn>(async (input) => {
      calls += 1;
      expect(input.toString().endsWith("/core/health")).toBe(true);
      return new Response(JSON.stringify(report), { status: 503 });
    });
    const proxy = new RpcProxy("http://example.com", fetchMock);
    await expect(proxy.health()).resolves.toEqual(report);
    expect(calls).toBe(1);
  });

  it("fails health on a status that is not an answer", async () => {
    const fetchMock = vi.fn<FetchFn>(
      async () =>
        new Response(JSON.stringify({ error: "nope" }), { status: 404 }),
    );
    const proxy = new RpcProxy("http://example.com", fetchMock);
    await expect(proxy.health()).rejects.toThrow(RpcError);
  });

  it("never retries POSTs — they may have acted", async () => {
    let calls = 0;
    const fetchMock = vi.fn<FetchFn>(async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "busy" }), { status: 503 });
    });
    const proxy = new RpcProxy("http://example.com", fetchMock);
    await expect(proxy.issueGuarantee(request())).rejects.toThrow(RpcError);
    expect(calls).toBe(1);
  });

  it("wraps transport failures into RpcError", async () => {
    const fetchMock = vi.fn<FetchFn>(async () => {
      throw new TypeError("fetch failed");
    });
    const proxy = new RpcProxy("http://example.com", fetchMock);
    await expect(proxy.issueGuarantee(request())).rejects.toThrow(RpcError);
  });

  it("returns decode error on invalid json", async () => {
    const fetchMock = vi.fn<FetchFn>(async () => {
      return new Response("not-json", { status: 200 });
    });
    const proxy = new RpcProxy("http://example.com", fetchMock);
    await expect(proxy.getPublicParams()).rejects.toThrow(RpcError);
  });

  it("answers null for an empty asset balance", async () => {
    const fetchMock = vi.fn<FetchFn>(async () => {
      // Core answers JSON null, not 404, when the user holds nothing.
      return new Response("null", { status: 200 });
    });
    const proxy = new RpcProxy("http://example.com", fetchMock);
    await expect(
      proxy.getUserAssetBalance("0xuser", "0xasset"),
    ).resolves.toBeNull();
  });

  it("adds bearer tokens without double prefixing", async () => {
    const expectAuth = (expected: string): FetchFn =>
      vi.fn<FetchFn>(async (_input, init) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe(expected);
        return new Response(JSON.stringify([]), { status: 200 });
      });

    await new RpcProxy("http://example.com", expectAuth("Bearer token"))
      .withBearerToken("token")
      .listRecipientPayments("0xr");

    await new RpcProxy("http://example.com", expectAuth("Bearer token"))
      .withBearerToken("Bearer token")
      .listRecipientPayments("0xr");
  });

  it("adds bearer token from provider", async () => {
    const fetchMock = vi.fn<FetchFn>(async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer token");
      return new Response(JSON.stringify([]), { status: 200 });
    });
    const proxy = new RpcProxy("http://example.com", fetchMock);
    proxy.withTokenProvider(async () => "token");
    await proxy.listRecipientPayments("0xr");
  });

  it("authorizes the suspension route with the session bearer only", async () => {
    const fetchMock = vi.fn<FetchFn>(async (input, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBeUndefined();
      if (input.toString().includes("/suspension")) {
        expect(headers.Authorization).toBe("Bearer token");
        return new Response(
          JSON.stringify({ user_address: "0xu", suspended: true }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(PARAMS), { status: 200 });
    });
    const proxy = new RpcProxy("http://example.com", fetchMock).withBearerToken(
      "token",
    );
    await proxy.getPublicParams();
    const status = await proxy.updateUserSuspension("0xu", true);
    expect(status.suspended).toBe(true);
  });

  it("encodes the clearing action query param", async () => {
    const fetchMock = vi.fn<FetchFn>(async (input) => {
      const url = new URL(input.toString());
      expect(url.pathname).toContain(
        "/core/cycles/0xcycle/participants/0xpart/clearing-action",
      );
      expect(url.searchParams.get("action")).toBe("pay_net_debit");
      return new Response(
        JSON.stringify({
          contract_address: "0x0000000000000000000000000000000000000009",
          function_name: "payNetDebit",
          action: "pay_net_debit",
          cycle_id: `0x${"aa".repeat(32)}`,
          cycle_id_text: "c",
          asset_address: "0x0000000000000000000000000000000000000003",
          participant: "0x0000000000000000000000000000000000000011",
          amount: "1",
          payable_value: "0",
          proof: [],
        }),
        { status: 200 },
      );
    });
    const proxy = new RpcProxy("http://example.com", fetchMock);
    const action = await proxy.getClearingSettlementAction(
      "0xcycle",
      "0xpart",
      "pay_net_debit",
    );
    expect(action.functionName).toBe("payNetDebit");
  });
});
