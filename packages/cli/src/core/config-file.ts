import { statSync } from "node:fs";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { NETWORKS, resolveNetwork } from "@4mica/sdk/networks";
import { configError, usageError } from "../errors.js";

export const CONFIG_KEYS = [
  "network",
  "rpc-url",
  "facilitator-url",
  "asset",
  "key-file",
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];
export type ConfigFile = Partial<Record<ConfigKey, string>>;

export const configPath = (configDir: string) => join(configDir, "config.json");

export function isConfigKey(key: string): key is ConfigKey {
  return (CONFIG_KEYS as readonly string[]).includes(key);
}

export function requireConfigKey(key: string): ConfigKey {
  if (isConfigKey(key)) return key;
  throw usageError(`unknown setting "${key}"`, {
    code: "UNKNOWN_SETTING",
    suggestions: [`use one of: ${CONFIG_KEYS.join(", ")}`],
  });
}

/**
 * Everything in the file, including keys this version does not know: a
 * newer CLI on the same machine may have written them, and rewriting the
 * file must not drop them.
 */
async function readRaw(configDir: string): Promise<Record<string, unknown>> {
  const path = configPath(configDir);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error();
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw configError(`${path} is not valid JSON`, {
      code: "BAD_CONFIG_FILE",
      suggestions: [
        `fix ${path}, or start again with \`4mica config reset\` (wallet keys are kept)`,
      ],
    });
  }
}

export async function readConfig(configDir: string): Promise<ConfigFile> {
  const raw = await readRaw(configDir);
  const config: ConfigFile = {};
  for (const key of CONFIG_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && value !== "") config[key] = value;
  }
  return config;
}

/**
 * Replaces the file in one step: written beside it, then renamed over it,
 * so a crash or a second run at the same moment never leaves half a file.
 * Settings this version does not know are carried over. Readable by the
 * user only: it names where the wallet key is.
 */
export async function writeConfig(
  configDir: string,
  config: ConfigFile,
  options: { reset?: boolean } = {},
): Promise<void> {
  const raw = options.reset ? {} : await readRaw(configDir);
  for (const key of CONFIG_KEYS) delete raw[key];
  await writeRaw(configDir, { ...raw, ...config });
}

async function writeRaw(
  configDir: string,
  raw: Record<string, unknown>,
): Promise<void> {
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  const path = configPath(configDir);
  const temp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(raw, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  if (process.platform !== "win32") await chmod(path, 0o600);
}

export interface SavedOrganization {
  id: string;
  handle: string | null;
  name: string;
}

export interface SavedProject {
  id: string;
  slug: string;
  name: string;
  orgId: string | null;
}

export interface SavedContext {
  org?: SavedOrganization;
  project?: SavedProject;
  environment?: string;
}

const isText = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export async function readContext(configDir: string): Promise<SavedContext> {
  const raw = record((await readRaw(configDir)).context);
  const org = record(raw.org);
  const project = record(raw.project);
  return {
    ...(isText(org.id)
      ? {
          org: {
            id: org.id,
            handle: isText(org.handle) ? org.handle : null,
            name: isText(org.name) ? org.name : org.id,
          },
        }
      : {}),
    ...(isText(project.id) && isText(project.slug)
      ? {
          project: {
            id: project.id,
            slug: project.slug,
            name: isText(project.name) ? project.name : project.slug,
            orgId: isText(project.orgId) ? project.orgId : null,
          },
        }
      : {}),
    ...(isText(raw.environment) ? { environment: raw.environment } : {}),
  };
}

export async function writeContext(
  configDir: string,
  context: SavedContext,
): Promise<void> {
  const raw = await readRaw(configDir);
  delete raw.context;
  const kept = Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined),
  );
  await writeRaw(
    configDir,
    Object.keys(kept).length > 0 ? { ...raw, context: kept } : raw,
  );
}

/** https, or plain http to this machine, as for `--rpc-url`. */
function requireUrl(key: ConfigKey, value: string): string {
  const parsed = URL.canParse(value) ? new URL(value) : undefined;
  const local =
    parsed && /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/.test(parsed.hostname);
  if (
    parsed?.protocol === "https:" ||
    (parsed?.protocol === "http:" && local)
  ) {
    return value;
  }
  throw usageError(
    parsed?.protocol === "http:"
      ? `${key} must use https unless it is on this machine, got "${value}"`
      : `${key} must be an http(s) URL, got "${value}"`,
    { code: "BAD_SETTING" },
  );
}

/** The value as it is stored: networks by their shorthand. */
export function normalizeSetting(key: ConfigKey, value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw usageError(`${key} cannot be empty`, {
      code: "BAD_SETTING",
      suggestions: [`remove it with \`4mica config unset ${key}\``],
    });
  }
  if (key === "network") {
    const network = resolveNetwork(trimmed);
    if (!network) {
      throw usageError(`unknown network "${trimmed}"`, {
        code: "UNKNOWN_NETWORK",
        suggestions: [`use one of: ${Object.keys(NETWORKS).join(", ")}`],
      });
    }
    return network.name;
  }
  if (key === "asset") return trimmed;
  if (key === "key-file") {
    // Absolute, so that it means the same file from any directory.
    const path = resolve(trimmed);
    const found = statSync(path, { throwIfNoEntry: false });
    if (!found) {
      throw usageError(`there is no file at ${path}`, {
        code: "KEY_FILE_NOT_FOUND",
      });
    }
    if (found.isDirectory()) {
      throw usageError(`${path} is a directory, not a key file`, {
        code: "KEY_FILE_UNREADABLE",
      });
    }
    return path;
  }
  return requireUrl(key, trimmed);
}

/**
 * `network` and `rpc-url` both choose the core to talk to, so setting one
 * drops the other.
 */
export function withSetting(
  config: ConfigFile,
  key: ConfigKey,
  value: string,
): ConfigFile {
  const next = { ...config, [key]: normalizeSetting(key, value) };
  if (key === "network") delete next["rpc-url"];
  if (key === "rpc-url") delete next.network;
  return next;
}
