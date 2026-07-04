import { describe, expect, it, vi } from "vitest";
import { ADMIN_API_KEY_HEADER } from "../src/constants";
import { RpcError } from "../src/errors";
import type { FetchFn } from "../src/rpc";
import { RpcProxy } from "../src/rpc";

describe("RpcProxy", () => {
  it("round trips public params", async () => {
    const params = {
      publicKey: [1, 2, 3],
      contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
      ethereumHttpRpcUrl: "http://localhost:8545",
      eip712Name: "4mica",
      eip712Version: "1",
      chainId: 1337,
      maxAcceptedGuaranteeVersion: 2,
      acceptedGuaranteeVersions: [1, 2],
      activeGuaranteeDomainSeparator: "0x" + "11".repeat(32),
      trustedValidationRegistries: [
        "0x0000000000000000000000000000000000000011",
      ],
      validationHashCanonicalizationVersion: "4MICA_VALIDATION_REQUEST_V1",
    };
    const fetchMock = vi.fn<FetchFn>(async (input) => {
      const url = input.toString();
      expect(url.endsWith("/core/public-params")).toBe(true);
      return new Response(JSON.stringify(params), { status: 200 });
    });

    const proxy = new RpcProxy("http://example.com", undefined, fetchMock);
    const got = await proxy.getPublicParams();
    expect(got.chainId).toBe(1337);
    expect(got.contractAddress).toBe(params.contractAddress);
    expect(got.ethereumHttpRpcUrl).toBe(params.ethereumHttpRpcUrl);
    expect(got.maxAcceptedGuaranteeVersion).toBe(2);
    expect(got.acceptedGuaranteeVersions).toEqual([1, 2]);
    expect(got.activeGuaranteeDomainSeparator).toBe(
      params.activeGuaranteeDomainSeparator,
    );
    expect(got.trustedValidationRegistries).toEqual(
      params.trustedValidationRegistries,
    );
    expect(got.validationHashCanonicalizationVersion).toBe(
      params.validationHashCanonicalizationVersion,
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
        },
      ],
    };
    const fetchMock = vi.fn<FetchFn>(async (input) => {
      const url = input.toString();
      expect(url.endsWith("/core/tokens")).toBe(true);
      return new Response(JSON.stringify(payload), { status: 200 });
    });

    const proxy = new RpcProxy("http://example.com", undefined, fetchMock);
    const got = await proxy.getSupportedTokens();
    expect(got.chainId).toBe(84532);
    expect(got.tokens).toEqual(payload.tokens);
  });

  it("surfaces api errors", async () => {
    const fetchMock = vi.fn<FetchFn>(async (input) => {
      expect(input.toString()).toContain("settlement_status=unknown");
      return new Response(
        JSON.stringify({ error: "invalid settlement status: unknown" }),
        {
          status: 400,
        },
      );
    });
    const proxy = new RpcProxy("http://example.com", undefined, fetchMock);
    await expect(
      proxy.listRecipientTabs("0xdeadbeef", ["unknown"]),
    ).rejects.toThrow(RpcError);
  });

  it("returns decode error on invalid json", async () => {
    const fetchMock = vi.fn<FetchFn>(async () => {
      return new Response("not-json", { status: 200 });
    });
    const proxy = new RpcProxy("http://example.com", undefined, fetchMock);
    await expect(proxy.getPublicParams()).rejects.toThrow(RpcError);
  });

  it("adds bearer tokens without double prefixing", async () => {
    const params = {
      publicKey: [1, 2, 3],
      contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
      ethereumHttpRpcUrl: "http://localhost:8545",
      eip712Name: "4mica",
      eip712Version: "1",
      chainId: 1337,
    };

    const fetchRaw = vi.fn<FetchFn>(async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer token");
      return new Response(JSON.stringify(params), { status: 200 });
    });
    await new RpcProxy("http://example.com", undefined, fetchRaw)
      .withBearerToken("token")
      .getPublicParams();

    const fetchPrefixed = vi.fn<FetchFn>(async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer token");
      return new Response(JSON.stringify(params), { status: 200 });
    });
    await new RpcProxy("http://example.com", undefined, fetchPrefixed)
      .withBearerToken("Bearer token")
      .getPublicParams();
  });

  it("adds bearer token from provider", async () => {
    const params = {
      publicKey: [1, 2, 3],
      contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
      ethereumHttpRpcUrl: "http://localhost:8545",
      eip712Name: "4mica",
      eip712Version: "1",
      chainId: 1337,
    };
    const fetchMock = vi.fn<FetchFn>(async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer token");
      return new Response(JSON.stringify(params), { status: 200 });
    });
    const proxy = new RpcProxy("http://example.com", undefined, fetchMock);
    proxy.withTokenProvider(async () => "token");
    await proxy.getPublicParams();
  });

  it("adds admin api key header", async () => {
    const params = {
      publicKey: [1, 2, 3],
      contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
      ethereumHttpRpcUrl: "http://localhost:8545",
      eip712Name: "4mica",
      eip712Version: "1",
      chainId: 1337,
    };
    const fetchMock = vi.fn<FetchFn>(async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers[ADMIN_API_KEY_HEADER]).toBe("key");
      return new Response(JSON.stringify(params), { status: 200 });
    });
    await new RpcProxy(
      "http://example.com",
      "key",
      fetchMock,
    ).getPublicParams();
  });

  it("encodes settlement status query params", async () => {
    const fetchMock = vi.fn<FetchFn>(async (input) => {
      const url = new URL(input.toString());
      expect(url.pathname).toContain("/core/recipients/0xdead/tabs");
      expect(url.searchParams.getAll("settlement_status")).toEqual([
        "PENDING",
        "SETTLED",
      ]);
      return new Response(JSON.stringify([]), { status: 200 });
    });
    const proxy = new RpcProxy("http://example.com", undefined, fetchMock);
    await proxy.listRecipientTabs("0xdead", ["PENDING", "SETTLED"]);
  });
});
