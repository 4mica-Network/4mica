import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigBuilder } from "@/config";
import { ConfigError } from "@/errors";

describe("ConfigBuilder", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env["4MICA_RPC_URL"];
    delete process.env["4MICA_NETWORK"];
    delete process.env["4MICA_WALLET_PRIVATE_KEY"];
    delete process.env["4MICA_ETHEREUM_HTTP_RPC_URL"];
    delete process.env["4MICA_CONTRACT_ADDRESS"];
    delete process.env["4MICA_ADMIN_API_KEY"];
    delete process.env["4MICA_AUTH_URL"];
    delete process.env["4MICA_AUTH_REFRESH_MARGIN_SECS"];
    delete process.env["4MICA_BEARER_TOKEN"];
  });

  it("reads from env", () => {
    process.env["4MICA_RPC_URL"] = "https://example.com";
    process.env["4MICA_WALLET_PRIVATE_KEY"] = "11".repeat(32);
    const address = privateKeyToAccount(
      ("0x" + "11".repeat(32)) as Hex,
    ).address;

    const cfg = new ConfigBuilder().fromEnv().build();
    expect(cfg.rpcUrl).toBe("https://example.com");
    expect(cfg.signer.address).toBe(address);
  });

  it("resolves base network by shorthand and CAIP-2", () => {
    const byName = new ConfigBuilder()
      .network("base")
      .walletPrivateKey("11".repeat(32))
      .build();
    const byCaip2 = new ConfigBuilder()
      .network("eip155:8453")
      .walletPrivateKey("11".repeat(32))
      .build();

    expect(byName.rpcUrl).toBe("https://base.api.4mica.xyz/");
    expect(byCaip2.rpcUrl).toBe("https://base.api.4mica.xyz/");
  });

  it("gives network env precedence over rpc url", () => {
    process.env["4MICA_NETWORK"] = "base";
    process.env["4MICA_RPC_URL"] = "https://example.com";
    process.env["4MICA_WALLET_PRIVATE_KEY"] = "11".repeat(32);

    const cfg = new ConfigBuilder().fromEnv().build();

    expect(cfg.rpcUrl).toBe("https://base.api.4mica.xyz/");
  });

  it("requires private key", () => {
    delete process.env["4MICA_WALLET_PRIVATE_KEY"];
    const builder = new ConfigBuilder().fromEnv();
    expect(() => builder.build()).toThrow(ConfigError);
  });

  it("rejects invalid private key", () => {
    const builder = new ConfigBuilder().walletPrivateKey("0x1234");
    expect(() => builder.build()).toThrow(ConfigError);
  });

  it("reads auth env defaults", () => {
    process.env["4MICA_RPC_URL"] = "https://example.com";
    process.env["4MICA_WALLET_PRIVATE_KEY"] = "11".repeat(32);
    process.env["4MICA_AUTH_REFRESH_MARGIN_SECS"] = "90";
    const cfg = new ConfigBuilder().fromEnv().build();
    expect(cfg.authUrl).toBe("https://example.com");
    expect(cfg.authRefreshMarginSecs).toBe(90);
  });

  it("reads bearer token", () => {
    process.env["4MICA_RPC_URL"] = "https://example.com";
    process.env["4MICA_WALLET_PRIVATE_KEY"] = "11".repeat(32);
    process.env["4MICA_BEARER_TOKEN"] = "token";
    const cfg = new ConfigBuilder().fromEnv().build();
    expect(cfg.bearerToken).toBe("token");
  });
});
