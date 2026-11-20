import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { configError, usageError } from "../errors.js";

export interface Wallet {
  name: string;
  /** The key file. */
  path: string;
  address: string;
}

const EXTENSION = ".key";
const NAME = /^[a-z0-9][a-z0-9_-]*$/;

export const walletsDir = (configDir: string) => join(configDir, "wallets");

export const walletPath = (configDir: string, name: string) =>
  join(walletsDir(configDir), `${name}${EXTENSION}`);

export function requireWalletName(name: string): string {
  if (NAME.test(name)) return name;
  throw usageError(`"${name}" is not a usable wallet name`, {
    code: "BAD_WALLET_NAME",
    suggestions: ["use lowercase letters, digits, - and _, such as buyer-1"],
  });
}

/** Never echoes the key, even when it is malformed. */
export async function addressFromKey(
  key: string,
  where: string,
): Promise<string> {
  const { privateKeyToAccount } = await import("viem/accounts");
  try {
    return privateKeyToAccount(
      (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`,
    ).address;
  } catch {
    throw configError(`${where} does not hold a valid private key`, {
      code: "BAD_SIGNER",
      suggestions: ["it should be 64 hex characters, with or without 0x"],
    });
  }
}

/**
 * Generates a key and writes it where only this user can read it. An
 * existing wallet is never overwritten: the key in it may hold funds.
 */
export async function createWallet(
  configDir: string,
  name: string,
  /** A key to keep, for importing a wallet; a new one is made without it. */
  existing?: { key: string; from: string },
): Promise<Wallet> {
  const { generatePrivateKey } = await import("viem/accounts");
  const key = existing?.key ?? generatePrivateKey();
  // Checked before anything is written.
  const address = await addressFromKey(key, existing?.from ?? "the new key");
  const path = walletPath(configDir, requireWalletName(name));
  await mkdir(walletsDir(configDir), { recursive: true, mode: 0o700 });
  try {
    await writeFile(path, `${key}\n`, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw usageError(`a wallet named ${name} already exists`, {
      code: "WALLET_EXISTS",
      suggestions: [
        "pick another name: `4mica wallets create <name>`",
        "see the ones you have with `4mica wallets`",
      ],
    });
  }
  return { name, path, address };
}

export async function listWallets(configDir: string): Promise<Wallet[]> {
  let files: string[];
  try {
    files = await readdir(walletsDir(configDir));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(
    files
      .filter((file) => file.endsWith(EXTENSION))
      .sort()
      .map(async (file) => {
        const path = join(walletsDir(configDir), file);
        const key = (await readFile(path, "utf8")).trim();
        return {
          name: file.slice(0, -EXTENSION.length),
          path,
          address: await addressFromKey(key, path),
        };
      }),
  );
}

/** Deletes the key. Whatever the address holds is out of reach after this. */
export async function removeWallet(wallet: Wallet): Promise<void> {
  await rm(wallet.path);
}
