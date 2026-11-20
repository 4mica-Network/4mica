import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

export async function readConfig(configDir: string): Promise<ConfigFile> {
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
    if (typeof parsed !== "object" || parsed === null) throw new Error();
    const config: ConfigFile = {};
    for (const key of CONFIG_KEYS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string" && value !== "") config[key] = value;
    }
    return config;
  } catch {
    throw configError(`${path} is not valid JSON`, {
      code: "BAD_CONFIG_FILE",
      suggestions: ["fix the file, or delete it to start again"],
    });
  }
}

export async function writeConfig(
  configDir: string,
  config: ConfigFile,
): Promise<void> {
  await mkdir(configDir, { recursive: true });
  await writeFile(
    configPath(configDir),
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

function requireUrl(key: ConfigKey, value: string): string {
  if (!URL.canParse(value) || !/^https?:$/.test(new URL(value).protocol)) {
    throw usageError(`${key} must be an http(s) URL, got "${value}"`, {
      code: "BAD_SETTING",
    });
  }
  return value;
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
    if (!existsSync(path)) {
      throw usageError(`there is no file at ${path}`, {
        code: "KEY_FILE_NOT_FOUND",
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
