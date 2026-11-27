import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
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

export interface Stored {
  token: string;
  storage: Storage;
  kind?: SessionKind;
}

export type CredentialResult =
  | { status: "found"; credential: Stored }
  | { status: "missing" }
  | { status: "unavailable"; reason: string };

type KeychainRead =
  | { status: "found"; token: string }
  | { status: "missing" }
  | { status: "unavailable"; reason: string };

const SERVICE = "4mica-cli";
const TOOL_TIMEOUT_MS = 5000;
const TOKEN = /^[A-Za-z0-9_-]+$/;
const MACOS_NOT_FOUND = 44;

const LOCK_WAIT_MS = 45_000;
const LOCK_STALE_MS = 20_000;
const LOCK_HEARTBEAT_MS = 5000;

export const credentialsDir = (configDir: string) =>
  join(configDir, "credentials");

const fileKey = (origin: string) =>
  createHash("sha256").update(origin).digest("hex").slice(0, 16);

export const credentialsFile = (configDir: string, origin: string) =>
  join(credentialsDir(configDir), `${fileKey(origin)}.json`);

interface Keychain {
  name: string;
  read(account: string): Promise<KeychainRead>;
  write(account: string, token: string): Promise<void>;
  remove(account: string): Promise<void>;
}

interface ToolResult {
  exitCode?: number;
  stdout: string;
  stderr: string;
  failed: boolean;
  timedOut?: boolean;
}

const tool = (file: string, args: string[], input?: string) =>
  execa(file, args, {
    input,
    reject: false,
    timeout: TOOL_TIMEOUT_MS,
    stdin: input === undefined ? "ignore" : "pipe",
  }) as Promise<ToolResult>;

const unavailable = (name: string, result: ToolResult): KeychainRead => ({
  status: "unavailable",
  reason: result.timedOut
    ? `${name} did not answer`
    : result.exitCode === undefined
      ? `${name} could not be opened`
      : `${name} refused (${result.stderr.trim().split("\n")[0] || `exit ${result.exitCode}`})`,
});

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
    if (!found.failed && found.stdout !== "") {
      return { status: "found", token: found.stdout };
    }
    return found.exitCode === MACOS_NOT_FOUND
      ? { status: "missing" }
      : unavailable(this.name, found);
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
    if (!found.failed && found.stdout !== "") {
      return { status: "found", token: found.stdout };
    }
    return found.exitCode === 1 && found.stderr.trim() === ""
      ? { status: "missing" }
      : unavailable(this.name, found);
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

async function writeAtomically(path: string, text: string): Promise<void> {
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, text, { mode: 0o600 });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  if (process.platform !== "win32") await chmod(path, 0o600);
}

async function writeEntry(configDir: string, entry: Entry): Promise<void> {
  await mkdir(credentialsDir(configDir), { recursive: true, mode: 0o700 });
  await writeAtomically(
    credentialsFile(configDir, entry.origin),
    `${JSON.stringify(entry, null, 2)}\n`,
  );
}

async function readEntry(
  configDir: string,
  origin: string,
): Promise<Entry | undefined> {
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

interface LockOwner {
  id: string;
  pid: number;
  host: string;
}

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

async function readOwner(path: string): Promise<LockOwner | undefined> {
  try {
    const owner = JSON.parse(await readFile(path, "utf8")) as LockOwner;
    return typeof owner.id === "string" ? owner : undefined;
  } catch {
    return undefined;
  }
}

async function isStale(path: string): Promise<LockOwner | false> {
  const [owner, held] = await Promise.all([
    readOwner(path),
    stat(path).catch(() => undefined),
  ]);
  if (!held) return false;
  const quiet = Date.now() - held.mtimeMs > LOCK_STALE_MS;
  if (!owner) return quiet ? { id: "", pid: 0, host: "" } : false;
  const dead = owner.host === hostname() && !isAlive(owner.pid);
  return dead || quiet ? owner : false;
}

async function breakStale(path: string, judged: LockOwner): Promise<void> {
  const aside = `${path}.${randomUUID()}.stale`;
  try {
    await rename(path, aside);
  } catch {
    return;
  }
  const taken = await readOwner(aside);
  if (taken && taken.id !== judged.id) {
    await rename(aside, path).catch(() => undefined);
    return;
  }
  await rm(aside, { force: true });
}

const lockedError = (path: string) =>
  configError("another 4mica command is changing the sign-in", {
    code: "CREDENTIALS_LOCKED",
    retryable: true,
    suggestions: [
      "wait for it to finish and try again",
      `if none is running, delete ${path}`,
    ],
  });

export async function withCredentialLock<T>(
  configDir: string,
  origin: string,
  use: () => Promise<T>,
): Promise<T> {
  await mkdir(credentialsDir(configDir), { recursive: true, mode: 0o700 });
  const path = `${credentialsFile(configDir, origin)}.lock`;
  const me: LockOwner = {
    id: randomUUID(),
    pid: process.pid,
    host: hostname(),
  };
  const deadline = Date.now() + LOCK_WAIT_MS;

  for (;;) {
    try {
      const handle = await open(path, "wx", 0o600);
      await handle.writeFile(JSON.stringify(me));
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stale = await isStale(path);
      if (stale) {
        debug(`taking over a stale credentials lock (pid ${stale.pid})`);
        await breakStale(path, stale);
        continue;
      }
      if (Date.now() > deadline) throw lockedError(path);
      await sleep(50 + Math.floor(Math.random() * 100));
    }
  }

  const heartbeat = setInterval(() => {
    const now = new Date();
    void utimes(path, now, now).catch(() => undefined);
  }, LOCK_HEARTBEAT_MS);
  heartbeat.unref();

  try {
    return await use();
  } finally {
    clearInterval(heartbeat);
    const owner = await readOwner(path);
    if (owner?.id === me.id) await rm(path, { force: true });
  }
}

export async function storedOrigins(configDir: string): Promise<string[]> {
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

export async function loadToken(
  configDir: string,
  origin: string,
  env: Env = process.env,
): Promise<CredentialResult> {
  const entry = await readEntry(configDir, origin);
  if (!entry) return { status: "missing" };
  if (entry.storage === "file") {
    return typeof entry.token === "string"
      ? {
          status: "found",
          credential: { token: entry.token, storage: "file", kind: entry.kind },
        }
      : { status: "missing" };
  }
  const keychain = keychainFor(env);
  if (!keychain) {
    return {
      status: "unavailable",
      reason:
        env.FOURMICA_CREDENTIAL_STORE === "file"
          ? "the token is in the system keychain, which FOURMICA_CREDENTIAL_STORE=file turns off"
          : "the token is in a system keychain this platform does not have",
    };
  }
  const read = await keychain.read(origin);
  if (read.status !== "found") return read;
  return {
    status: "found",
    credential: { token: read.token, storage: "keychain", kind: entry.kind },
  };
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
      const check = await keychain.read(origin);
      if (check.status === "found" && check.token === token) {
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
