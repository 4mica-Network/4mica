import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import {
  NETWORKS,
  type NetworkInfo,
  resolveNetwork,
} from "@4mica/sdk/networks";
import { configError, usageError } from "../errors.js";
import type { ConfigFile } from "./config-file.js";

/** In the order they win. */
export type Source = "flag" | "env" | "env-file" | "config" | "default";

export interface Resolved {
  value: string;
  source: Source;
}

export type Env = Record<string, string | undefined>;

/** A key file that has been read: where it is, who named it, what it holds. */
export interface KeyFile {
  path: string;
  source: "flag" | "config";
  key: string;
}

export interface SettingsInput {
  flags: { network?: string; "rpc-url"?: string; asset?: string };
  env: Env;
  envFile?: Env;
  /** Path of `envFile`, for telling the user where a value came from. */
  envFilePath?: string;
  /** The env file was found in the working directory, not named. */
  envFileFound?: boolean;
  /** From `--key-file`, else from the config file's `key-file`. */
  keyFile?: KeyFile;
  /** Why the config file's `key-file` could not be read. */
  keyProblem?: Error;
  config: ConfigFile;
}

export interface Settings {
  /**
   * Shorthand of a hosted network: named, or recognised from its core URL.
   * Unset for any other core given by URL.
   */
  network?: Resolved;
  info?: NetworkInfo;
  rpcUrl: Resolved;
  facilitatorUrl?: Resolved;
  asset?: Resolved;
  /**
   * Where the wallet key came from, and the file if it came from one. The
   * key itself stays in `sdkEnv`.
   */
  key?: { source: Source; file?: string };
  /**
   * Why the config file's `key-file` gave no key. Kept, not thrown, until a
   * command needs the wallet: `4mica tokens` does not.
   */
  keyProblem?: Error;
  /** Every `FOURMICA_*` variable in effect, for `FourMica.connect({ env })`. */
  sdkEnv: Record<string, string>;
  /** The env file that was read, if any. */
  envFilePath?: string;
  /** It was found in the working directory, not named with `--dotenv`. */
  envFileFound?: boolean;
  /**
   * The variables taken from the env file that change where a wallet signs
   * in and sends, such as `CONTRACT_ADDRESS`. Without the prefix.
   */
  redirects: string[];
}

/** `flag`, `env`, `config`, `default`, or the path of the env file. */
export const origin = (settings: Settings, resolved: Resolved): string =>
  resolved.source === "env-file"
    ? (settings.envFilePath ?? "env-file")
    : resolved.source;

/**
 * Where the cli goes when nothing names a network. Always a testnet, and
 * deliberately not the SDK's `DEFAULT_NETWORK`, which moves to mainnet at
 * general availability: a terminal command that moves real money should have
 * been told to, by `--network base` or `4mica config set network base`.
 */
export const DEFAULT_TESTNET = "base-sepolia";

// A shell cannot export a name starting with a digit, so FOURMICA_ is the
// spelling. Projects scaffolded before 0.3 have 4MICA_ in their `.env`,
// which is still read; new ones are made with FOURMICA_ only.
const PREFIXES = ["FOURMICA_", "4MICA_"] as const;

export function readEnv(env: Env, name: string): string | undefined {
  const [preferred, legacy] = PREFIXES.map((prefix) => env[prefix + name]);
  if (preferred && legacy && preferred !== legacy) {
    throw configError(
      `FOURMICA_${name} and 4MICA_${name} are both set, to different values`,
      { code: "CONFLICTING_ENV", suggestions: ["unset one of them"] },
    );
  }
  return preferred || legacy || undefined;
}

export async function loadEnvFile(path: string): Promise<Env> {
  return parseEnv(await readFile(path, "utf8"));
}

function names(env: Env): string[] {
  return Object.keys(env).flatMap((key) => {
    const prefix = PREFIXES.find((p) => key.startsWith(p));
    return prefix ? [key.slice(prefix.length)] : [];
  });
}

function unknownNetwork(value: string, source: Source) {
  const make = source === "flag" ? usageError : configError;
  return make(`unknown network "${value}"`, {
    code: "UNKNOWN_NETWORK",
    suggestions: [`use one of: ${Object.keys(NETWORKS).join(", ")}`],
  });
}

/**
 * Besides the core itself, everything that decides where a wallet signs in
 * and where its transactions go: the contract, the chain it is reached
 * through, the facilitator that sends for it, and who it is to core.
 */
const REDIRECTS = new Set([
  "CONTRACT_ADDRESS",
  "ETHEREUM_HTTP_RPC_URL",
  "FACILITATOR_URL",
  "AUTH_URL",
  "BEARER_TOKEN",
]);

/** A core URL without the differences that do not change where it leads. */
function coreKey(url: string): string {
  const { origin, pathname } = new URL(url);
  return origin + pathname.replace(/\/+$/, "");
}

/** The hosted network whose core this URL is, if it is one. */
function hostedAt(
  url: string,
): { name: string; info: NetworkInfo } | undefined {
  const key = coreKey(url);
  const name = Object.keys(NETWORKS).find(
    (n) => coreKey(NETWORKS[n].rpcUrl) === key,
  );
  return name === undefined ? undefined : { name, info: NETWORKS[name] };
}

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/;

/** On this machine, whatever the scheme. */
export const isLoopback = (url: string): boolean =>
  URL.canParse(url) && LOOPBACK.test(new URL(url).hostname);

/**
 * A core URL from any source: https, or plain http to this machine. A
 * wallet signs in to core and sends it signed payments, which must not
 * cross a network in clear text; `file:` and the like are not cores at all.
 */
export function requireCoreUrl(resolved: Resolved): void {
  const { value, source } = resolved;
  const make = source === "flag" ? usageError : configError;
  const where =
    source === "flag" ? "--rpc-url" : source === "default" ? "default" : source;
  if (!URL.canParse(value)) {
    throw make(`the core URL "${value}" (${where}) is not a URL`, {
      code: "BAD_RPC_URL",
    });
  }
  const { protocol } = new URL(value);
  if (protocol === "https:" || (protocol === "http:" && isLoopback(value))) {
    return;
  }
  throw make(
    protocol === "http:"
      ? `the core URL "${value}" (${where}) is plain http to another machine`
      : `the core URL "${value}" (${where}) is not an http(s) URL`,
    {
      code: "BAD_RPC_URL",
      suggestions: [
        protocol === "http:"
          ? "use https: the wallet signs in and sends payments over this connection"
          : "give the core's https:// address; it is not an Ethereum RPC endpoint",
      ],
    },
  );
}

/**
 * Whether money sent here is known not to be real: a hosted testnet, or a
 * core on this machine. Anything else gets the mainnet treatment, since
 * nothing about a URL says which chain its core settles on.
 */
export function isKnownSafe(settings: Settings): boolean {
  if (settings.info) return settings.info.testnet;
  return isLoopback(settings.rpcUrl.value);
}

export function resolveSettings(input: SettingsInput): Settings {
  const { flags, env, envFile = {}, config } = input;

  const fromEnv = (name: string): Resolved | undefined => {
    const value = readEnv(env, name);
    if (value) return { value, source: "env" };
    const filed = readEnv(envFile, name);
    return filed ? { value: filed, source: "env-file" } : undefined;
  };
  const at = (value: string | undefined, source: Source) =>
    value ? { value, source } : undefined;

  // Within one source a network name beats a URL, as in the SDK.
  const levels: [Resolved | undefined, Resolved | undefined][] = [
    [at(flags.network, "flag"), at(flags["rpc-url"], "flag")],
    [at(readEnv(env, "NETWORK"), "env"), at(readEnv(env, "RPC_URL"), "env")],
    [
      at(readEnv(envFile, "NETWORK"), "env-file"),
      at(readEnv(envFile, "RPC_URL"), "env-file"),
    ],
    [at(config.network, "config"), at(config["rpc-url"], "config")],
    [at(DEFAULT_TESTNET, "default"), undefined],
  ];
  const [network, url] = levels.find(([n, u]) => n ?? u) ?? [];

  let settings: Pick<Settings, "network" | "info" | "rpcUrl">;
  if (network) {
    const hosted = resolveNetwork(network.value);
    if (!hosted) throw unknownNetwork(network.value, network.source);
    settings = {
      network: { value: hosted.name, source: network.source },
      info: hosted.info,
      rpcUrl: { value: hosted.info.rpcUrl, source: network.source },
    };
  } else {
    const custom = url as Resolved;
    requireCoreUrl(custom);
    // A hosted network reached by its URL is still that network: it gets
    // the same mainnet warning and confirmation as when it is named.
    const hosted = hostedAt(custom.value);
    settings = hosted
      ? {
          network: { value: hosted.name, source: custom.source },
          info: hosted.info,
          rpcUrl: custom,
        }
      : { rpcUrl: custom };
  }

  const hostedFacilitator = settings.info?.facilitatorUrl;
  const facilitatorUrl =
    fromEnv("FACILITATOR_URL") ??
    at(config["facilitator-url"], "config") ??
    at(hostedFacilitator, "default");

  const sdkEnv: Record<string, string> = {};
  const redirects: string[] = [];
  for (const name of new Set([...names(env), ...names(envFile)])) {
    const resolved = fromEnv(name);
    if (!resolved) continue;
    sdkEnv[`FOURMICA_${name}`] = resolved.value;
    if (resolved.source === "env-file" && REDIRECTS.has(name)) {
      redirects.push(name);
    }
  }
  // Passed to the SDK explicitly, so flags and the config file can win.
  delete sdkEnv.FOURMICA_NETWORK;
  delete sdkEnv.FOURMICA_RPC_URL;

  // A key file named on the command line wins; one named in the config
  // file is the last resort, like every other config value.
  const { keyFile } = input;
  const fromVariable = fromEnv("WALLET_PRIVATE_KEY");
  const useKeyFile = keyFile && (keyFile.source === "flag" || !fromVariable);
  if (useKeyFile) sdkEnv.FOURMICA_WALLET_PRIVATE_KEY = keyFile.key;
  const key = useKeyFile
    ? { source: keyFile.source, file: keyFile.path }
    : fromVariable && {
        source: fromVariable.source,
        file:
          fromVariable.source === "env-file" ? input.envFilePath : undefined,
      };

  return {
    ...settings,
    facilitatorUrl,
    asset:
      at(flags.asset, "flag") ?? fromEnv("ASSET") ?? at(config.asset, "config"),
    key,
    keyProblem: key ? undefined : input.keyProblem,
    sdkEnv,
    envFilePath: input.envFilePath,
    envFileFound: input.envFileFound,
    redirects,
  };
}

/**
 * A `.env` that was merely found may put its own wallet on a mainnet, but
 * not a wallet it does not hold: running a command inside someone else's
 * project must not move the key kept in the config file, or exported in the
 * shell, onto real funds. Called before a wallet is used.
 *
 * A core the file gives by URL counts unless it is a hosted testnet or on
 * this machine: nothing else about a URL shows that it is not a mainnet.
 *
 * Nor may the file change where a mainnet the user did choose leads: its
 * contract address would otherwise be what the wallet approves and deposits
 * to, on the network named in the confirmation.
 */
export function assertMainnetWasChosen(settings: Settings): void {
  const { network, info, rpcUrl, key, envFilePath, redirects } = settings;
  if (!settings.envFileFound || key?.source === "env-file") return;
  if (info?.testnet === true) return;
  if (!network && isLoopback(rpcUrl.value)) return;

  const stay = `to stay on a testnet: --network ${DEFAULT_TESTNET}`;
  const notTheirs = "but the wallet key does not come from that file";
  if (rpcUrl.source !== "env-file") {
    if (redirects.length === 0) return;
    const set = redirects.map((name) => `FOURMICA_${name}`).join(", ");
    const where = network
      ? `${network.value} (mainnet, real funds)`
      : `the core at ${rpcUrl.value}, which is not a known testnet`;
    throw configError(`${envFilePath} sets ${set} for ${where}, ${notTheirs}`, {
      code: "ENDPOINT_NOT_CHOSEN",
      suggestions: [
        `to use what it sets, name the file: --dotenv ${envFilePath}`,
        stay,
      ],
    });
  }
  if (network) {
    throw configError(
      `${envFilePath} selects ${network.value} (mainnet, real funds), ${notTheirs}`,
      {
        code: "MAINNET_NOT_CHOSEN",
        suggestions: [
          `to use ${network.value}, say so: --network ${network.value}, or --dotenv ${envFilePath}`,
          stay,
        ],
      },
    );
  }
  throw configError(
    `${envFilePath} selects the core at ${rpcUrl.value}, which is not a ` +
      `known testnet, ${notTheirs}`,
    {
      code: "CORE_NOT_CHOSEN",
      suggestions: [
        `to use it, say so: --rpc-url ${rpcUrl.value}, or --dotenv ${envFilePath}`,
        stay,
      ],
    },
  );
}

/** `"base-sepolia"`, or the URL of a core given directly. */
export const networkName = (settings: Settings): string =>
  settings.network?.value ?? settings.rpcUrl.value;
