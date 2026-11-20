import { NETWORKS } from "@4mica/sdk/networks";
import { describe, expect, it } from "vitest";
import { EXIT } from "../errors.js";
import { DEFAULT_TESTNET, readEnv, resolveSettings } from "./settings.js";

const exitOf = (run: () => unknown): number | undefined => {
  try {
    run();
  } catch (error) {
    return (error as { oclif?: { exit?: number } }).oclif?.exit;
  }
  return undefined;
};

describe("resolveSettings", () => {
  it("falls back to a testnet, whatever the SDK's default becomes", () => {
    const settings = resolveSettings({ flags: {}, env: {}, config: {} });
    expect(settings.network).toEqual({
      value: DEFAULT_TESTNET,
      source: "default",
    });
    expect(settings.rpcUrl.value).toBe(NETWORKS[DEFAULT_TESTNET].rpcUrl);
    // Fails the build if this network is ever dropped or goes live.
    expect(settings.info?.testnet).toBe(true);
  });

  it("takes a flag over env, env over the env file, the file over config", () => {
    const config = { network: "base" };
    const envFile = { FOURMICA_NETWORK: "ethereum-sepolia" };
    const env = { FOURMICA_NETWORK: "base-sepolia" };
    const pick = (input: Parameters<typeof resolveSettings>[0]) =>
      resolveSettings(input).network;

    expect(pick({ flags: {}, env: {}, config })).toEqual({
      value: "base",
      source: "config",
    });
    expect(pick({ flags: {}, env: {}, envFile, config })).toEqual({
      value: "ethereum-sepolia",
      source: "env-file",
    });
    expect(pick({ flags: {}, env, envFile, config })).toEqual({
      value: "base-sepolia",
      source: "env",
    });
    expect(pick({ flags: { network: "base" }, env, envFile, config })).toEqual({
      value: "base",
      source: "flag",
    });
  });

  it("stores a CAIP-2 id as the network's shorthand", () => {
    const settings = resolveSettings({
      flags: { network: "eip155:8453" },
      env: {},
      config: {},
    });
    expect(settings.network?.value).toBe("base");
    expect(settings.info?.testnet).toBe(false);
  });

  it("lets a core URL from a higher source replace a network from a lower one", () => {
    const settings = resolveSettings({
      flags: { "rpc-url": "http://localhost:3000" },
      env: { FOURMICA_NETWORK: "base" },
      config: {},
    });
    expect(settings.network).toBeUndefined();
    expect(settings.rpcUrl).toEqual({
      value: "http://localhost:3000",
      source: "flag",
    });
    // A hosted network's facilitator does not carry over to another core.
    expect(settings.facilitatorUrl).toBeUndefined();
  });

  it("calls an unknown network a usage error from a flag, a config error otherwise", () => {
    expect(
      exitOf(() =>
        resolveSettings({ flags: { network: "nope" }, env: {}, config: {} }),
      ),
    ).toBe(EXIT.usage);
    expect(
      exitOf(() =>
        resolveSettings({
          flags: {},
          env: { FOURMICA_NETWORK: "nope" },
          config: {},
        }),
      ),
    ).toBe(EXIT.config);
  });

  it("reads the legacy 4MICA_ spelling, as scaffolded .env files use it", () => {
    const settings = resolveSettings({
      flags: {},
      env: {},
      envFile: { "4MICA_WALLET_PRIVATE_KEY": "0xabc", "4MICA_AUTH_URL": "x" },
      config: {},
    });
    expect(settings.key).toEqual({ source: "env-file" });
    expect(settings.sdkEnv).toEqual({
      FOURMICA_WALLET_PRIVATE_KEY: "0xabc",
      FOURMICA_AUTH_URL: "x",
    });
  });

  describe("wallet key", () => {
    const keyFile = (source: "flag" | "config") => ({
      path: "/keys/wallet",
      source,
      key: "0xfile",
    });
    const env = { FOURMICA_WALLET_PRIVATE_KEY: "0xenv" };

    it("prefers --key-file to the environment", () => {
      const settings = resolveSettings({
        flags: {},
        env,
        keyFile: keyFile("flag"),
        config: {},
      });
      expect(settings.key).toEqual({ source: "flag", file: "/keys/wallet" });
      expect(settings.sdkEnv.FOURMICA_WALLET_PRIVATE_KEY).toBe("0xfile");
    });

    it("uses the config file's key file only when nothing else has a key", () => {
      const fromConfig = keyFile("config");
      expect(
        resolveSettings({ flags: {}, env, keyFile: fromConfig, config: {} })
          .sdkEnv.FOURMICA_WALLET_PRIVATE_KEY,
      ).toBe("0xenv");
      expect(
        resolveSettings({ flags: {}, env: {}, keyFile: fromConfig, config: {} })
          .key,
      ).toEqual({ source: "config", file: "/keys/wallet" });
    });

    it("says which env file a key came from", () => {
      const settings = resolveSettings({
        flags: {},
        env: {},
        envFile: { FOURMICA_WALLET_PRIVATE_KEY: "0xdotenv" },
        envFilePath: "/project/.env",
        config: {},
      });
      expect(settings.key).toEqual({
        source: "env-file",
        file: "/project/.env",
      });
    });
  });

  it("keeps the network out of the SDK env, since it is passed explicitly", () => {
    const { sdkEnv } = resolveSettings({
      flags: { network: "base" },
      env: { FOURMICA_NETWORK: "base-sepolia", FOURMICA_RPC_URL: "http://x" },
      config: {},
    });
    expect(sdkEnv).toEqual({});
  });

  it("takes the asset from the flag, then the config file", () => {
    const config = { asset: "USDC" };
    expect(resolveSettings({ flags: {}, env: {}, config }).asset).toEqual({
      value: "USDC",
      source: "config",
    });
    expect(
      resolveSettings({ flags: { asset: "ETH" }, env: {}, config }).asset,
    ).toEqual({ value: "ETH", source: "flag" });
  });
});

describe("readEnv", () => {
  it("refuses two spellings of one variable with different values", () => {
    expect(
      exitOf(() =>
        readEnv({ FOURMICA_NETWORK: "base", "4MICA_NETWORK": "x" }, "NETWORK"),
      ),
    ).toBe(EXIT.config);
    expect(
      readEnv({ FOURMICA_NETWORK: "base", "4MICA_NETWORK": "base" }, "NETWORK"),
    ).toBe("base");
  });
});
