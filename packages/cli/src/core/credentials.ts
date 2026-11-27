import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { configError } from "../errors.js";
import { debug } from "../ui/log.js";

/**
 * Where the account token is kept. The system keychain when there is one:
 * the macOS keychain through `security`, the Secret Service (GNOME Keyring,
 * KWallet) through `secret-tool`. Both ship with the system or its desktop,
 * so the cli needs no native module to reach them. Anywhere else (Windows,
 * a container, a server with no desktop session) the token goes in a file
 * only this user can read, as the wallet keys do.
 *
 * `credentials.json` records which of the two holds the token for each
 * platform API, and holds the token itself only in the second case.
 */
export type Storage = "keychain" | "file";

type Entry = { storage: "keychain" } | { storage: "file"; token: string };

const SERVICE = "4mica-cli";
const TOOL_TIMEOUT_MS = 5000;
/** Everything a token is made of; nothing a shell-like parser would split. */
const TOKEN = /^[A-Za-z0-9_-]+$/;

export const credentialsPath = (configDir: string) =>
  join(configDir, "credentials.json");

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
    // Through `security -i`, which reads its command from stdin: as an
    // argument the token would show in the process list while it runs.
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

/** `FOURMICA_CREDENTIAL_STORE=file` keeps the cli away from the keychain. */
function keychainFor(env: Env): Keychain | undefined {
  if (env.FOURMICA_CREDENTIAL_STORE === "file") return undefined;
  if (process.platform === "darwin") return macos;
  if (process.platform === "linux") return secretService;
  return undefined;
}

async function readFileEntries(
  configDir: string,
): Promise<Record<string, Entry>> {
  const path = credentialsPath(configDir);
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
    return parsed as Record<string, Entry>;
  } catch {
    throw configError(`${path} is not valid JSON`, {
      code: "BAD_CREDENTIALS_FILE",
      suggestions: [
        `delete ${path} and sign in again with \`4mica auth login\``,
      ],
    });
  }
}

/** In one step, and readable by this user only, like the config file. */
async function writeFileEntries(
  configDir: string,
  entries: Record<string, Entry>,
): Promise<void> {
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  const path = credentialsPath(configDir);
  if (Object.keys(entries).length === 0) {
    await rm(path, { force: true });
    return;
  }
  const temp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(entries, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  if (process.platform !== "win32") await chmod(path, 0o600);
}

/** The platform APIs a token is kept for, for saying where one is signed in. */
export async function storedOrigins(configDir: string): Promise<string[]> {
  return Object.keys(await readFileEntries(configDir));
}

export interface Stored {
  token: string;
  storage: Storage;
}

/** The token kept for the platform API at `origin`, if there is one. */
export async function loadToken(
  configDir: string,
  origin: string,
  env: Env = process.env,
): Promise<Stored | undefined> {
  const entry = (await readFileEntries(configDir))[origin];
  if (!entry) return undefined;
  if (entry.storage === "file") {
    return typeof entry.token === "string"
      ? { token: entry.token, storage: "file" }
      : undefined;
  }
  const token = await keychainFor(env)?.read(origin);
  return token ? { token, storage: "keychain" } : undefined;
}

export interface SaveOptions {
  /** Never the keychain, whatever the system has. */
  fileOnly?: boolean;
  env?: Env;
}

/**
 * Keeps the token, in the keychain when it takes it. What was written is
 * read back before it is trusted: `security -i` reports a refusal on a
 * stream, not in its exit status, and a keyring with no session to unlock
 * it fails the same quiet way.
 */
export async function saveToken(
  configDir: string,
  origin: string,
  token: string,
  options: SaveOptions = {},
): Promise<{ storage: Storage; where: string }> {
  const entries = await readFileEntries(configDir);
  const keychain = options.fileOnly
    ? undefined
    : keychainFor(options.env ?? process.env);
  if (keychain && TOKEN.test(token)) {
    try {
      await keychain.write(origin, token);
      if ((await keychain.read(origin)) === token) {
        await writeFileEntries(configDir, {
          ...entries,
          [origin]: { storage: "keychain" },
        });
        return { storage: "keychain", where: keychain.name };
      }
      debug(`${keychain.name} did not keep the token; using a file`);
    } catch (error) {
      debug(`${keychain.name} is not usable: ${(error as Error).message}`);
    }
  }
  await writeFileEntries(configDir, {
    ...entries,
    [origin]: { storage: "file", token },
  });
  return { storage: "file", where: credentialsPath(configDir) };
}

/** Forgets the token for `origin`, wherever it was kept. */
export async function removeToken(
  configDir: string,
  origin: string,
  env: Env = process.env,
): Promise<boolean> {
  const { [origin]: entry, ...rest } = await readFileEntries(configDir);
  if (!entry) return false;
  if (entry.storage === "keychain") {
    try {
      await keychainFor(env)?.remove(origin);
    } catch (error) {
      debug(`could not clear the keychain entry: ${(error as Error).message}`);
    }
  }
  await writeFileEntries(configDir, rest);
  return true;
}
