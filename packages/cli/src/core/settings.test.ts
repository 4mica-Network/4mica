import { NETWORKS } from "@4mica/sdk/networks";
import { describe, expect, it } from "vitest";
import { EXIT } from "../errors.js";
import {
  assertMainnetWasChosen,
  DEFAULT_TESTNET,
  readEnv,
  resolveSettings,
} from "./settings.js";

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

describe("a mainnet named only by a .env that was found", () => {
  const keyFile = {
    path: "/keys/wallet",
    source: "config" as const,
    key: "0x1",
  };
  const found = {
    flags: {},
    env: {},
    envFile: { FOURMICA_NETWORK: "base" },
    envFilePath: "/clone/.env",
    envFileFound: true,
    config: {},
  };
  const check = (input: Parameters<typeof resolveSettings>[0]) => () =>
    assertMainnetWasChosen(resolveSettings(input));

  it("is refused for a wallet that comes from somewhere else", () => {
    expect(exitOf(check({ ...found, keyFile }))).toBe(EXIT.config);
    expect(
      exitOf(
        check({ ...found, env: { FOURMICA_WALLET_PRIVATE_KEY: "0xshell" } }),
      ),
    ).toBe(EXIT.config);
    expect(check({ ...found, keyFile })).toThrow(
      "/clone/.env selects base (mainnet, real funds)",
    );
  });

  it("is allowed for the wallet that same file holds", () => {
    const envFile = { ...found.envFile, FOURMICA_WALLET_PRIVATE_KEY: "0x2" };
    expect(check({ ...found, envFile })).not.toThrow();
  });

  it("is allowed once the file or the network is named", () => {
    expect(check({ ...found, keyFile, envFileFound: false })).not.toThrow();
    expect(
      check({ ...found, keyFile, flags: { network: "base" } }),
    ).not.toThrow();
    expect(
      check({ ...found, keyFile, env: { FOURMICA_NETWORK: "base" } }),
    ).not.toThrow();
    expect(
      check({ ...found, keyFile, envFile: {}, config: { network: "base" } }),
    ).not.toThrow();
  });

  it("leaves a testnet from a found .env alone", () => {
    const envFile = { FOURMICA_NETWORK: "base-sepolia" };
    expect(check({ ...found, keyFile, envFile })).not.toThrow();
  });

  describe("given by its core URL instead of its name", () => {
    const mainnet = NETWORKS.base.rpcUrl;

    it.each([
      mainnet,
      mainnet.replace(/\/$/, ""),
      "https://BASE.API.4MICA.IO:443//",
    ])("is refused all the same: %s", (url) => {
      const envFile = { "4MICA_RPC_URL": url };
      expect(exitOf(check({ ...found, keyFile, envFile }))).toBe(EXIT.config);
      expect(check({ ...found, keyFile, envFile })).toThrow(
        "/clone/.env selects base (mainnet, real funds)",
      );
    });

    it("is still allowed for the wallet that same file holds", () => {
      const envFile = {
        FOURMICA_RPC_URL: mainnet,
        FOURMICA_WALLET_PRIVATE_KEY: "0x2",
      };
      expect(check({ ...found, envFile })).not.toThrow();
    });

    it("is recognised wherever the URL comes from, for the confirmation", () => {
      const settings = resolveSettings({
        flags: { "rpc-url": mainnet },
        env: {},
        config: {},
      });
      expect(settings.network).toEqual({ value: "base", source: "flag" });
      expect(settings.info?.testnet).toBe(false);
      expect(settings.rpcUrl).toEqual({ value: mainnet, source: "flag" });
      // Named on the command line: chosen.
      expect(() => assertMainnetWasChosen(settings)).not.toThrow();
    });

    it("leaves a hosted testnet's URL alone", () => {
      const envFile = { FOURMICA_RPC_URL: NETWORKS["base-sepolia"].rpcUrl };
      expect(check({ ...found, keyFile, envFile })).not.toThrow();
    });
  });

  describe("or a core nobody can vouch for", () => {
    const proxy = { FOURMICA_RPC_URL: "https://core.example/" };

    it("is refused for a wallet that comes from somewhere else", () => {
      const run = check({ ...found, keyFile, envFile: proxy });
      expect(exitOf(run)).toBe(EXIT.config);
      expect(run).toThrow(
        "/clone/.env selects the core at https://core.example/, which is not a known testnet",
      );
      expect(run).toThrow(expect.objectContaining({ code: "CORE_NOT_CHOSEN" }));
    });

    it("is allowed for the file's own wallet, or once it is named", () => {
      const own = { ...proxy, FOURMICA_WALLET_PRIVATE_KEY: "0x2" };
      expect(check({ ...found, envFile: own })).not.toThrow();
      expect(
        check({ ...found, keyFile, envFile: proxy, envFileFound: false }),
      ).not.toThrow();
      expect(
        check({
          ...found,
          keyFile,
          envFile: proxy,
          flags: { "rpc-url": proxy.FOURMICA_RPC_URL },
        }),
      ).not.toThrow();
    });

    it.each([
      "http://localhost:3000",
      "http://127.0.0.1:3000/",
      "http://[::1]:3000",
    ])("leaves a core on this machine alone: %s", (url) => {
      const envFile = { FOURMICA_RPC_URL: url };
      expect(check({ ...found, keyFile, envFile })).not.toThrow();
    });
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
