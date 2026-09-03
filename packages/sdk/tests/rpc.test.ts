import { describe, expect, it, vi } from "vitest";
import { ADMIN_API_KEY_HEADER } from "@/constants";
import { RpcError } from "@/errors";
import type { FetchFn } from "@/rpc";
import { RpcProxy } from "@/rpc";

const PARAMS = {
  public_key: `0x${"00".repeat(48)}`,
  contract_address: "0x1234567890abcdef1234567890abcdef12345678",
  ethereum_http_rpc_url: "http://localhost:8545",
  eip712_name: "4mica",
  eip712_version: "1",
  chain_id: 1337,
  supported_guarantee_versions: [1],
  guarantee_domains: [{ version: 1, domain_separator: `0x${"11".repeat(32)}` }],
};

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
    expect(got.supportedGuaranteeVersions).toEqual([1]);
    expect(got.guaranteeDomains[0]?.domainSeparator).toBe(
      `0x${"11".repeat(32)}`,
    );
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

  it("issues guarantees and parses the certificate", async () => {
    const fetchMock = vi.fn<FetchFn>(async (input, init) => {
      expect(input.toString().endsWith("/core/guarantees")).toBe(true);
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({ claims: "0x0102", signature: "0x03" }),
        { status: 200 },
      );
    });
    const proxy = new RpcProxy("http://example.com", fetchMock);
    const cert = await proxy.issueGuarantee({ claims: {} });
    expect(cert.claims).toBe("0x0102");
    expect(cert.signature).toBe("0x03");
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
    await expect(proxy.health()).rejects.toThrow(RpcError);
    expect(calls).toBe(1);
  });

  it("never retries POSTs — they may have acted", async () => {
    let calls = 0;
    const fetchMock = vi.fn<FetchFn>(async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "busy" }), { status: 503 });
    });
    const proxy = new RpcProxy("http://example.com", fetchMock);
    await expect(proxy.issueGuarantee({})).rejects.toThrow(RpcError);
    expect(calls).toBe(1);
  });

  it("wraps transport failures into RpcError", async () => {
    const fetchMock = vi.fn<FetchFn>(async () => {
      throw new TypeError("fetch failed");
    });
    const proxy = new RpcProxy("http://example.com", fetchMock);
    await expect(proxy.issueGuarantee({})).rejects.toThrow(RpcError);
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

  it("sends the admin api key only on admin routes", async () => {
    const fetchMock = vi.fn<FetchFn>(async (input, init) => {
      const headers = init?.headers as Record<string, string>;
      if (input.toString().includes("/suspension")) {
        expect(headers[ADMIN_API_KEY_HEADER]).toBe("key");
        return new Response(
          JSON.stringify({ user_address: "0xu", suspended: true }),
          { status: 200 },
        );
      }
      expect(headers[ADMIN_API_KEY_HEADER]).toBeUndefined();
      return new Response(JSON.stringify(PARAMS), { status: 200 });
    });
    const proxy = new RpcProxy("http://example.com", fetchMock).withAdminApiKey(
      "key",
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
