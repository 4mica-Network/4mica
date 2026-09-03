import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientCtx } from "@/client/ctx";
import { ConfigBuilder } from "@/config";
import { ChainRpcUnavailableError, ClientInitializationError } from "@/errors";
import { CorePublicParameters } from "@/models";

const CONTRACT_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const TEST_PRIVATE_KEY = `0x${"11".repeat(32)}`;

const PARAMS: Record<string, unknown> = {
  public_key: `0x${"00".repeat(48)}`,
  contract_address: CONTRACT_ADDRESS,
  eip712_name: "4mica",
  eip712_version: "1",
  chain_id: 84532,
  supported_guarantee_versions: [1],
  guarantee_domains: [{ version: 1, domain_separator: `0x${"11".repeat(32)}` }],
};

const state = vi.hoisted(() => ({
  paramsRaw: {} as Record<string, unknown> | Error,
  calls: [] as string[],
  closed: false,
}));

vi.mock("@/rpc", () => {
  class FakeRpcProxy {
    withTokenProvider() {
      state.calls.push("withTokenProvider");
      return this;
    }

    withBearerToken() {
      state.calls.push("withBearerToken");
      return this;
    }

    async getPublicParams() {
      state.calls.push("getPublicParams");
      if (state.paramsRaw instanceof Error) {
        throw state.paramsRaw;
      }
      return CorePublicParameters.fromRpc(state.paramsRaw);
    }

    async aclose() {
      state.closed = true;
    }
  }
  return { RpcProxy: FakeRpcProxy };
});

function useParams(paramsRaw: Record<string, unknown> | Error): void {
  state.paramsRaw = paramsRaw;
  state.calls = [];
  state.closed = false;
}

function config() {
  return new ConfigBuilder()
    .rpcUrl("https://core.example/")
    .walletPrivateKey(TEST_PRIVATE_KEY)
    .build();
}

beforeEach(() => {
  useParams(PARAMS);
});

describe("ClientCtx.create", () => {
  it("resolves published guarantee domains", async () => {
    const ctx = await ClientCtx.create(config());
    expect(Array.from(ctx.guaranteeDomain)).toEqual(Array(32).fill(0x11));
    expect(ctx.guaranteeDomainForVersion(1)).toEqual(ctx.guaranteeDomain);
    expect(ctx.contractAddress.toLowerCase()).toBe(CONTRACT_ADDRESS);
    expect(ctx.chainId).toBe(84532);
  });

  it("fails fast when core cannot take v1", async () => {
    useParams({ ...PARAMS, supported_guarantee_versions: [2] });
    await expect(ClientCtx.create(config())).rejects.toThrow(
      /signs guarantee v1/,
    );
  });

  it("rejects a bad operator key", async () => {
    useParams({ ...PARAMS, public_key: "0x0102" });
    await expect(ClientCtx.create(config())).rejects.toThrow(
      /operator public key/,
    );
  });

  it("needs an Ethereum endpoint when core publishes no domains", async () => {
    useParams({ ...PARAMS, guarantee_domains: [] });
    await expect(ClientCtx.create(config())).rejects.toThrow(
      ChainRpcUnavailableError,
    );
  });

  it("gateway() needs an Ethereum endpoint", async () => {
    const ctx = await ClientCtx.create(config());
    expect(ctx.ethereumHttpRpcUrl).toBeUndefined();
    await expect(ctx.gateway()).rejects.toThrow(ChainRpcUnavailableError);
  });

  it("stays unauthenticated until the public params resolve", async () => {
    await ClientCtx.create(config());
    expect(state.calls).toEqual(["getPublicParams", "withTokenProvider"]);
  });

  it("closes the proxy when connect fails", async () => {
    useParams(new Error("core is down"));
    await expect(ClientCtx.create(config())).rejects.toThrow("core is down");
    expect(state.closed).toBe(true);
    expect(state.calls).not.toContain("withTokenProvider");
  });

  it("attaches no credentials with auth disabled", async () => {
    const cfg = new ConfigBuilder()
      .rpcUrl("https://core.example/")
      .walletPrivateKey(TEST_PRIVATE_KEY)
      .disableAuth()
      .build();
    const ctx = await ClientCtx.create(cfg);
    expect(ctx.authSession).toBeUndefined();
    expect(state.calls).toEqual(["getPublicParams"]);
  });

  it("attaches a bearer token instead of SIWE when configured", async () => {
    const cfg = new ConfigBuilder()
      .rpcUrl("https://core.example/")
      .walletPrivateKey(TEST_PRIVATE_KEY)
      .bearerToken("token")
      .build();
    const ctx = await ClientCtx.create(cfg);
    expect(ctx.authSession).toBeUndefined();
    expect(state.calls).toEqual(["getPublicParams", "withBearerToken"]);
  });

  it("prefers the configured Ethereum url over core's", async () => {
    useParams({ ...PARAMS, ethereum_http_rpc_url: "https://core-advertised/" });
    const cfg = new ConfigBuilder()
      .rpcUrl("https://core.example/")
      .walletPrivateKey(TEST_PRIVATE_KEY)
      .ethereumHttpRpcUrl("https://explicit/")
      .build();
    const ctx = await ClientCtx.create(cfg);
    expect(ctx.ethereumHttpRpcUrl).toBe("https://explicit/");
  });

  it("is a ClientInitializationError when the handshake fails", async () => {
    useParams({ ...PARAMS, supported_guarantee_versions: [2] });
    await expect(ClientCtx.create(config())).rejects.toThrow(
      ClientInitializationError,
    );
  });
});
