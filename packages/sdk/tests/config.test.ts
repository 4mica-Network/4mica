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
    delete process.env["4MICA_AUTH_URL"];
    delete process.env["4MICA_AUTH_REFRESH_MARGIN_SECS"];
    delete process.env["4MICA_BEARER_TOKEN"];
    delete process.env["4MICA_FACILITATOR_URL"];
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

    expect(byName.rpcUrl).toBe("https://base.api.4mica.io/");
    expect(byCaip2.rpcUrl).toBe("https://base.api.4mica.io/");
  });

  it("gives network env precedence over rpc url", () => {
    process.env["4MICA_NETWORK"] = "base";
    process.env["4MICA_RPC_URL"] = "https://example.com";
    process.env["4MICA_WALLET_PRIVATE_KEY"] = "11".repeat(32);

    const cfg = new ConfigBuilder().fromEnv().build();

    expect(cfg.rpcUrl).toBe("https://base.api.4mica.io/");
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

  it("reads bearer token, which replaces SIWE auth", () => {
    process.env["4MICA_RPC_URL"] = "https://example.com";
    process.env["4MICA_WALLET_PRIVATE_KEY"] = "11".repeat(32);
    process.env["4MICA_BEARER_TOKEN"] = "token";
    const cfg = new ConfigBuilder().fromEnv().build();
    expect(cfg.bearerToken).toBe("token");
    expect(cfg.authUrl).toBeUndefined();
  });

  it("disableAuth clears the auth endpoint", () => {
    const cfg = new ConfigBuilder()
      .rpcUrl("https://example.com")
      .walletPrivateKey("11".repeat(32))
      .disableAuth()
      .build();
    expect(cfg.authUrl).toBeUndefined();
    expect(cfg.authRefreshMarginSecs).toBeUndefined();
  });

  it("reads the facilitator url from the environment", () => {
    process.env["4MICA_RPC_URL"] = "https://example.com";
    process.env["4MICA_WALLET_PRIVATE_KEY"] = "11".repeat(32);
    process.env["4MICA_FACILITATOR_URL"] = "https://facilitator.example";
    const cfg = new ConfigBuilder().fromEnv().build();
    expect(cfg.facilitatorUrl).toBe("https://facilitator.example");
  });
});

describe("ConfigBuilder env prefixes and facilitator defaults", () => {
  const KEY = "11".repeat(32);

  it("reads FOURMICA_ variables", () => {
    const cfg = new ConfigBuilder()
      .fromEnv({
        FOURMICA_NETWORK: "base",
        FOURMICA_WALLET_PRIVATE_KEY: KEY,
        FOURMICA_FACILITATOR_URL: "https://facilitator.example/",
      })
      .build();
    expect(cfg.rpcUrl).toBe("https://base.api.4mica.io/");
    expect(cfg.facilitatorUrl).toBe("https://facilitator.example/");
  });

  it("accepts both prefixes when they agree, and refuses them when they differ", () => {
    const agree = new ConfigBuilder()
      .fromEnv({
        FOURMICA_WALLET_PRIVATE_KEY: KEY,
        "4MICA_WALLET_PRIVATE_KEY": KEY,
        "4MICA_RPC_URL": "https://example.com",
      })
      .build();
    expect(agree.rpcUrl).toBe("https://example.com");

    expect(() =>
      new ConfigBuilder().fromEnv({
        FOURMICA_NETWORK: "base",
        "4MICA_NETWORK": "base-sepolia",
      }),
    ).toThrow(/FOURMICA_NETWORK and 4MICA_NETWORK/);
  });

  it("defaults the facilitator to the network's hosted one", () => {
    const sepolia = new ConfigBuilder()
      .network("base-sepolia")
      .walletPrivateKey(KEY)
      .build();
    expect(sepolia.facilitatorUrl).toBe("https://testnet.payment.4mica.io/");

    const base = new ConfigBuilder()
      .network("base")
      .walletPrivateKey(KEY)
      .build();
    expect(base.facilitatorUrl).toBeUndefined();

    const fromEnv = new ConfigBuilder()
      .fromEnv({
        FOURMICA_NETWORK: "base-sepolia",
        FOURMICA_WALLET_PRIVATE_KEY: KEY,
      })
      .build();
    expect(fromEnv.facilitatorUrl).toBe("https://testnet.payment.4mica.io/");
  });

  it("lets an explicit facilitator win, in either order", () => {
    for (const builder of [
      new ConfigBuilder()
        .facilitatorUrl("https://mine.example/")
        .network("base-sepolia"),
      new ConfigBuilder()
        .network("base-sepolia")
        .facilitatorUrl("https://mine.example/"),
    ]) {
      expect(builder.walletPrivateKey(KEY).build().facilitatorUrl).toBe(
        "https://mine.example/",
      );
    }
  });

  it("drops the hosted facilitator when rpcUrl points at a self-hosted core", () => {
    const cfg = new ConfigBuilder()
      .network("base-sepolia")
      .rpcUrl("https://core.example/")
      .walletPrivateKey(KEY)
      .build();
    expect(cfg.facilitatorUrl).toBeUndefined();
  });

  it("leaves the facilitator unset when no network was chosen", () => {
    const cfg = new ConfigBuilder().walletPrivateKey(KEY).build();
    expect(cfg.rpcUrl).toBe("https://base.sepolia.api.4mica.io/");
    expect(cfg.facilitatorUrl).toBeUndefined();
  });
});
