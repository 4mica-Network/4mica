import { NETWORKS } from "@4mica/sdk/networks";
import { describe, expect, it } from "vitest";
import { EXIT } from "../errors.js";
import {
  assertMainnetWasChosen,
  DEFAULT_TESTNET,
  isKnownSafe,
  readEnv,
  requireApiUrl,
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

describe("a found .env on a mainnet the user chose", () => {
  const keyFile = {
    path: "/keys/wallet",
    source: "config" as const,
    key: "0x1",
  };
  const chosen = {
    flags: {},
    env: {},
    envFilePath: "/clone/.env",
    envFileFound: true,
    keyFile,
    config: { network: "base" },
  };
  const check = (input: Parameters<typeof resolveSettings>[0]) => () =>
    assertMainnetWasChosen(resolveSettings(input));

  it.each([
    "CONTRACT_ADDRESS",
    "ETHEREUM_HTTP_RPC_URL",
    "FACILITATOR_URL",
    "AUTH_URL",
    "BEARER_TOKEN",
  ])("may not set %s for a wallet it does not hold", (name) => {
    // A URL where one is wanted: a value that is not one is refused sooner.
    const value = name.endsWith("_URL") ? "https://elsewhere.example" : "0xA";
    const run = check({ ...chosen, envFile: { [`FOURMICA_${name}`]: value } });
    expect(exitOf(run)).toBe(EXIT.config);
    expect(run).toThrow(
      `/clone/.env sets FOURMICA_${name} for base (mainnet, real funds)`,
    );
    expect(run).toThrow(
      expect.objectContaining({ code: "ENDPOINT_NOT_CHOSEN" }),
    );
  });

  it("is refused in the scaffolded spelling, and on a core given by URL", () => {
    const envFile = { "4MICA_CONTRACT_ADDRESS": "0xA" };
    expect(exitOf(check({ ...chosen, envFile }))).toBe(EXIT.config);
    expect(
      check({
        ...chosen,
        envFile,
        config: {},
        flags: { "rpc-url": "https://core.example" },
      }),
    ).toThrow("for the core at https://core.example, which is not a known");
  });

  it("may set them for its own wallet, or once it is named", () => {
    const envFile = { FOURMICA_CONTRACT_ADDRESS: "0xA" };
    const own = { ...envFile, FOURMICA_WALLET_PRIVATE_KEY: "0x2" };
    expect(
      check({ ...chosen, keyFile: undefined, envFile: own }),
    ).not.toThrow();
    expect(check({ ...chosen, envFile, envFileFound: false })).not.toThrow();
  });

  it("is not the one setting what the shell sets", () => {
    const env = { FOURMICA_CONTRACT_ADDRESS: "0xMine" };
    const envFile = { FOURMICA_CONTRACT_ADDRESS: "0xA" };
    const settings = resolveSettings({ ...chosen, env, envFile });
    expect(settings.sdkEnv.FOURMICA_CONTRACT_ADDRESS).toBe("0xMine");
    expect(() => assertMainnetWasChosen(settings)).not.toThrow();
  });

  it("may set them on a testnet, or for a core on this machine", () => {
    const envFile = { FOURMICA_CONTRACT_ADDRESS: "0xA" };
    expect(
      check({ ...chosen, envFile, config: { network: "base-sepolia" } }),
    ).not.toThrow();
    expect(
      check({
        ...chosen,
        envFile,
        config: { "rpc-url": "http://localhost:3000" },
      }),
    ).not.toThrow();
    expect(
      check({
        ...chosen,
        config: {},
        envFile: { ...envFile, FOURMICA_RPC_URL: "http://127.0.0.1:3000" },
      }),
    ).not.toThrow();
  });

  it("may set what does not change where the wallet leads", () => {
    const envFile = { FOURMICA_AUTH_REFRESH_MARGIN_SECS: "30" };
    expect(check({ ...chosen, envFile })).not.toThrow();
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

describe("a core given by url", () => {
  const at = (url: string, source: "flag" | "env" = "flag") =>
    resolveSettings({
      flags: source === "flag" ? { "rpc-url": url } : {},
      env: source === "env" ? { FOURMICA_RPC_URL: url } : {},
      config: {},
    });

  it.each([
    ["https://core.example"],
    ["http://127.0.0.1:3000"],
    ["http://localhost:3000"],
    ["http://[::1]:3000"],
  ])("takes %s", (url) => {
    expect(at(url).rpcUrl.value).toBe(url);
  });

  it.each([
    ["file:///etc/passwd"],
    ["ftp://core.example"],
    ["http://core.example"],
    ["not a url"],
  ])("refuses %s, from a flag as a usage error and from the environment as a config error", (url) => {
    expect(() => at(url)).toThrow(
      expect.objectContaining({
        code: "BAD_RPC_URL",
        oclif: { exit: EXIT.usage },
      }),
    );
    expect(() => at(url, "env")).toThrow(
      expect.objectContaining({
        code: "BAD_RPC_URL",
        oclif: { exit: EXIT.config },
      }),
    );
  });

  it.each([
    ["env", { env: { FOURMICA_FACILITATOR_URL: "http://pay.example" } }],
    [
      "env-file",
      { envFile: { FOURMICA_FACILITATOR_URL: "ftp://pay.example" } },
    ],
    ["config", { config: { "facilitator-url": "http://pay.example" } }],
  ] as const)("holds a facilitator url from %s to the same rule", (_source, input) => {
    expect(() =>
      resolveSettings({ flags: {}, env: {}, config: {}, ...input }),
    ).toThrow(
      expect.objectContaining({
        code: "BAD_FACILITATOR_URL",
        oclif: { exit: EXIT.config },
      }),
    );
  });

  it("takes a facilitator on this machine over http, and a hosted one as it is", () => {
    const local = resolveSettings({
      flags: {},
      env: { FOURMICA_FACILITATOR_URL: "http://localhost:8080" },
      config: {},
    });
    expect(local.facilitatorUrl?.value).toBe("http://localhost:8080");
    const hosted = resolveSettings({ flags: {}, env: {}, config: {} });
    expect(hosted.facilitatorUrl).toMatchObject({ source: "default" });
  });

  it("is treated as real funds unless it is a hosted testnet or on this machine", () => {
    expect(isKnownSafe(at("https://core.example"))).toBe(false);
    expect(isKnownSafe(at("http://127.0.0.1:3000"))).toBe(true);
    expect(
      isKnownSafe(resolveSettings({ flags: {}, env: {}, config: {} })),
    ).toBe(true);
    expect(
      isKnownSafe(
        resolveSettings({ flags: { network: "base" }, env: {}, config: {} }),
      ),
    ).toBe(false);
  });
});

describe("the platform url", () => {
  const check = (value: string) => () =>
    requireApiUrl({ value, source: "env" });

  it.each([
    ["https://api.example"],
    ["https://api.example/"],
    ["http://127.0.0.1:4000"],
  ])("takes %s", (url) => {
    expect(check(url)).not.toThrow();
  });

  it.each([
    ["https://gateway.example/4mica"],
    ["https://gateway.example/4mica/"],
    ["https://api.example/?tenant=a"],
    ["https://api.example/#x"],
  ])("refuses %s, since only its origin would be used", (url) => {
    expect(check(url)).toThrow(
      expect.objectContaining({
        code: "BAD_API_URL",
        oclif: { exit: EXIT.config },
        suggestions: [`give only the origin: ${new URL(url).origin}`],
      }),
    );
  });
});

describe("the asset", () => {
  it("comes from FOURMICA_ASSET, below the flag and above the config file", () => {
    const settings = (flags: { asset?: string }, env: Record<string, string>) =>
      resolveSettings({ flags, env, config: { asset: "ETH" } }).asset;
    expect(settings({}, {})).toEqual({ value: "ETH", source: "config" });
    expect(settings({}, { FOURMICA_ASSET: "USDC" })).toEqual({
      value: "USDC",
      source: "env",
    });
    expect(settings({ asset: "USDT" }, { FOURMICA_ASSET: "USDC" })).toEqual({
      value: "USDT",
      source: "flag",
    });
  });
});

describe("the variable prefix", () => {
  it("is FOURMICA_ in everything new projects are made from", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { packageRoot } = await import("./package-root.js");
    const root = join(packageRoot, "templates");
    const legacy: string[] = [];
    for (const entry of await readdir(root, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue;
      const path = join(entry.parentPath, entry.name);
      if (/(^|[^A-Z])4MICA_/.test(await readFile(path, "utf8")))
        legacy.push(path);
    }
    expect(legacy).toEqual([]);
  });
});
