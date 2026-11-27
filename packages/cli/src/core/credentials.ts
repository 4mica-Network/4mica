import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { execa } from "execa";
import { configError } from "../errors.js";
import { debug } from "../ui/log.js";

export type Storage = "keychain" | "file";

export type SessionKind = "DEVICE" | "TOKEN";

interface Entry {
  origin: string;
  storage: Storage;
  kind?: SessionKind;
  token?: string;
}

const SERVICE = "4mica-cli";
const TOOL_TIMEOUT_MS = 5000;
const TOKEN = /^[A-Za-z0-9_-]+$/;

const LOCK_WAIT_MS = 15_000;
const LOCK_STALE_MS = 30_000;

export const credentialsDir = (configDir: string) =>
  join(configDir, "credentials");

const fileKey = (origin: string) =>
  createHash("sha256").update(origin).digest("hex").slice(0, 16);

export const credentialsFile = (configDir: string, origin: string) =>
  join(credentialsDir(configDir), `${fileKey(origin)}.json`);

const legacyFile = (configDir: string) => join(configDir, "credentials.json");

interface Keychain {
  name: string;
  read(account: string): Promise<string | undefined>;
  write(account: string, token: string): Promise<void>;
  remove(account: string): Promise<void>;
}

const tool = (
  file: string,
  args: string[],
  input?: string,
): Promise<{ exitCode?: number; stdout: string; failed: boolean }> =>
  execa(file, args, {
    input,
    reject: false,
    timeout: TOOL_TIMEOUT_MS,
    stdin: input === undefined ? "ignore" : "pipe",
    stderr: "ignore",
  }) as Promise<{ exitCode?: number; stdout: string; failed: boolean }>;

const macos: Keychain = {
  name: "the macOS keychain",
  async read(account) {
    const found = await tool("security", [
      "find-generic-password",
      "-s",
      SERVICE,
      "-a",
      account,
      "-w",
    ]);
    return found.failed || found.stdout === "" ? undefined : found.stdout;
  },
  async write(account, token) {
    await tool(
      "security",
      ["-i"],
      `add-generic-password -U -s "${SERVICE}" -a "${account}" -w "${token}"\n`,
    );
  },
  async remove(account) {
    await tool("security", [
      "delete-generic-password",
      "-s",
      SERVICE,
      "-a",
      account,
    ]);
  },
};

const secretService: Keychain = {
  name: "the system keyring",
  async read(account) {
    const found = await tool("secret-tool", [
      "lookup",
      "service",
      SERVICE,
      "account",
      account,
    ]);
    return found.failed || found.stdout === "" ? undefined : found.stdout;
  },
  async write(account, token) {
    await tool(
      "secret-tool",
      ["store", "--label", "4mica CLI", "service", SERVICE, "account", account],
      token,
    );
  },
  async remove(account) {
    await tool("secret-tool", [
      "clear",
      "service",
      SERVICE,
      "account",
      account,
    ]);
  },
};

type Env = Record<string, string | undefined>;

function keychainFor(env: Env): Keychain | undefined {
  if (env.FOURMICA_CREDENTIAL_STORE === "file") return undefined;
  if (process.platform === "darwin") return macos;
  if (process.platform === "linux") return secretService;
  return undefined;
}

const keychainRequired = (env: Env) =>
  env.FOURMICA_CREDENTIAL_STORE === "keychain";

const badFile = (path: string) =>
  configError(`${path} is not valid JSON`, {
    code: "BAD_CREDENTIALS_FILE",
    suggestions: [`delete ${path} and sign in again with \`4mica auth login\``],
  });

async function readJson(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw badFile(path);
  }
}

async function writeEntry(configDir: string, entry: Entry): Promise<void> {
  const dir = credentialsDir(configDir);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = credentialsFile(configDir, entry.origin);
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(entry, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  if (process.platform !== "win32") await chmod(path, 0o600);
}

async function migrateLegacy(configDir: string): Promise<void> {
  const path = legacyFile(configDir);
  const legacy = await readJson(path);
  if (legacy === undefined) return;
  if (typeof legacy !== "object" || legacy === null || Array.isArray(legacy)) {
    throw badFile(path);
  }
  for (const [origin, value] of Object.entries(legacy)) {
    const old = value as { storage?: unknown; token?: unknown };
    if (old.storage === "keychain") {
      await writeEntry(configDir, { origin, storage: "keychain" });
    } else if (typeof old.token === "string") {
      await writeEntry(configDir, {
        origin,
        storage: "file",
        token: old.token,
      });
    }
  }
  await rm(path, { force: true });
}

async function readEntry(
  configDir: string,
  origin: string,
): Promise<Entry | undefined> {
  await migrateLegacy(configDir);
  const path = credentialsFile(configDir, origin);
  const parsed = await readJson(path);
  if (parsed === undefined) return undefined;
  const entry = parsed as Partial<Entry>;
  if (
    entry.origin !== origin ||
    (entry.storage !== "keychain" && entry.storage !== "file")
  ) {
    throw badFile(path);
  }
  return entry as Entry;
}

export async function withCredentialLock<T>(
  configDir: string,
  origin: string,
  use: () => Promise<T>,
): Promise<T> {
  await mkdir(credentialsDir(configDir), { recursive: true, mode: 0o700 });
  const lock = `${credentialsFile(configDir, origin)}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const handle = await open(lock, "wx");
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const held = await stat(lock).catch(() => undefined);
      if (held && Date.now() - held.mtimeMs > LOCK_STALE_MS) {
        await rm(lock, { force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw configError("another 4mica command is changing the sign-in", {
          code: "CREDENTIALS_LOCKED",
          retryable: true,
          suggestions: [
            "wait for it to finish and try again",
            `if none is running, delete ${lock}`,
          ],
        });
      }
      await sleep(50 + Math.floor(Math.random() * 100));
    }
  }
  try {
    return await use();
  } finally {
    await rm(lock, { force: true });
  }
}

export async function storedOrigins(configDir: string): Promise<string[]> {
  await migrateLegacy(configDir);
  let names: string[];
  try {
    names = await readdir(credentialsDir(configDir));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const origins: string[] = [];
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    const entry = (await readJson(join(credentialsDir(configDir), name))) as
      | Partial<Entry>
      | undefined;
    if (typeof entry?.origin === "string") origins.push(entry.origin);
  }
  return origins;
}

export interface Stored {
  token: string;
  storage: Storage;
  kind?: SessionKind;
}

export async function loadToken(
  configDir: string,
  origin: string,
  env: Env = process.env,
): Promise<Stored | undefined> {
  const entry = await readEntry(configDir, origin);
  if (!entry) return undefined;
  if (entry.storage === "file") {
    return typeof entry.token === "string"
      ? { token: entry.token, storage: "file", kind: entry.kind }
      : undefined;
  }
  const token = await keychainFor(env)?.read(origin);
  return token ? { token, storage: "keychain", kind: entry.kind } : undefined;
}

export interface SaveOptions {
  kind?: SessionKind;
  fileOnly?: boolean;
  env?: Env;
}

export async function saveToken(
  configDir: string,
  origin: string,
  token: string,
  options: SaveOptions = {},
): Promise<{ storage: Storage; where: string }> {
  const env = options.env ?? process.env;
  const keychain = options.fileOnly ? undefined : keychainFor(env);
  if (keychain && TOKEN.test(token)) {
    try {
      await keychain.write(origin, token);
      if ((await keychain.read(origin)) === token) {
        await writeEntry(configDir, {
          origin,
          storage: "keychain",
          kind: options.kind,
        });
        return { storage: "keychain", where: keychain.name };
      }
      debug(`${keychain.name} did not keep the token`);
    } catch (error) {
      debug(`${keychain.name} is not usable: ${(error as Error).message}`);
    }
  }
  if (keychainRequired(env)) {
    throw configError("the system keychain could not keep the token", {
      code: "KEYCHAIN_UNAVAILABLE",
      suggestions: [
        keychain
          ? `unlock ${keychain.name} and sign in again`
          : "this system has no keychain the cli can use; on Linux, install secret-tool",
        "or allow a file readable by your user only: unset FOURMICA_CREDENTIAL_STORE",
      ],
    });
  }
  await writeEntry(configDir, {
    origin,
    storage: "file",
    kind: options.kind,
    token,
  });
  return { storage: "file", where: credentialsFile(configDir, origin) };
}

export async function removeToken(
  configDir: string,
  origin: string,
  env: Env = process.env,
): Promise<boolean> {
  const entry = await readEntry(configDir, origin);
  if (!entry) return false;
  if (entry.storage === "keychain") {
    try {
      await keychainFor(env)?.remove(origin);
    } catch (error) {
      debug(`could not clear the keychain entry: ${(error as Error).message}`);
    }
  }
  await rm(credentialsFile(configDir, origin), { force: true });
  return true;
}
