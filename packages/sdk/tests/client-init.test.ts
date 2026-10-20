import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientCtx } from "@/client/ctx";
import { ConfigBuilder } from "@/config";
import { ChainRpcUnavailableError, ClientInitializationError } from "@/errors";
import { clearingHouseDomain, guaranteeRegistryDomain } from "@/guarantee";
import { CorePublicParameters } from "@/models";

const CONTRACT_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const TEST_PRIVATE_KEY = `0x${"11".repeat(32)}`;

const CLEARING_HOUSE = "0x00000000000000000000000000000000C1ea4111";
const REGISTRY = "0x0000000000000000000000000000000000065E61";
const OPERATOR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const PARAMS: Record<string, unknown> = {
  guarantee_signer: OPERATOR,
  contract_address: CONTRACT_ADDRESS,
  guarantee_registry_address: REGISTRY,
  clearing_house_address: CLEARING_HOUSE,
  eip712_name: "4micaClearingHouse",
  eip712_version: "1",
  chain_id: 84532,
  supported_payment_payload_versions: [1],
};

const without = (key: string) =>
  Object.fromEntries(Object.entries(PARAMS).filter(([k]) => k !== key));

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
  it("resolves the signing domains from core", async () => {
    const ctx = await ClientCtx.create(config());
    expect(ctx.clearingHouseDomain).toEqual(
      clearingHouseDomain(84532, CLEARING_HOUSE),
    );
    expect(ctx.guaranteeDomain).toEqual(
      guaranteeRegistryDomain(84532, REGISTRY),
    );
    expect(ctx.guaranteeSigner).toBe(OPERATOR);
    expect(ctx.contractAddress.toLowerCase()).toBe(CONTRACT_ADDRESS);
    expect(ctx.chainId).toBe(84532);
  });

  it("fails fast when core cannot take v1", async () => {
    useParams({ ...PARAMS, supported_payment_payload_versions: [2] });
    await expect(ClientCtx.create(config())).rejects.toThrow(
      /signs payment payload v1/,
    );
  });

  it("refuses a core that accepts no payload version", async () => {
    useParams({ ...PARAMS, supported_payment_payload_versions: [] });
    await expect(ClientCtx.create(config())).rejects.toThrow(
      /core accepts \[\]/,
    );
  });

  it("accepts a core that predates payload versions", async () => {
    useParams(without("supported_payment_payload_versions"));
    await expect(ClientCtx.create(config())).resolves.toBeInstanceOf(ClientCtx);
  });

  it.each([
    ["clearing_house_address", "clearing house address"],
    ["guarantee_registry_address", "guarantee registry address"],
    ["guarantee_signer", "guarantee signer"],
  ])("refuses a core missing %s", async (field, label) => {
    // Every payment is signed or verified against these, so a core that
    // omits one is refused at connect rather than at the first payment.
    useParams(without(field));
    await expect(ClientCtx.create(config())).rejects.toThrow(label);
    expect(state.closed).toBe(true);
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
    useParams({ ...PARAMS, supported_payment_payload_versions: [2] });
    await expect(ClientCtx.create(config())).rejects.toThrow(
      ClientInitializationError,
    );
  });
});
