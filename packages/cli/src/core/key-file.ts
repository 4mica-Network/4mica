import { readFile, stat } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { configError, usageError } from "../errors.js";
import { note, warn } from "../ui/log.js";
import type { KeyFile } from "./settings.js";

/** Why a key file gave no key, by Node's name for the failure. */
const UNREADABLE: Record<string, (path: string) => string> = {
  ENOENT: (path) => `there is no key file at ${path}`,
  EISDIR: (path) => `${path} is a directory, not a key file`,
  EACCES: (path) => `no permission to read ${path}`,
};

/**
 * Reads the wallet key from a file, or from stdin for `-`. A file is the
 * safest place the CLI can take a key from: unlike an exported variable it
 * is not handed to every child process.
 */
export async function readKeyFile(
  path: string,
  source: KeyFile["source"],
): Promise<KeyFile> {
  const where = path === "-" ? "stdin" : path;
  let content: string;
  try {
    if (path === "-") {
      content = await text(process.stdin);
    } else {
      // Like ssh, object to a key others can read; unlike ssh, still use it.
      const { mode } = await stat(path);
      if (process.platform !== "win32" && (mode & 0o077) !== 0) {
        note(
          warn(`${path} is readable by other users; run: chmod 600 ${path}`),
        );
      }
      content = await readFile(path, "utf8");
    }
  } catch (error) {
    const { code = "" } = error as NodeJS.ErrnoException;
    if (!(code in UNREADABLE)) throw error;
    const make = source === "flag" ? usageError : configError;
    throw make(UNREADABLE[code](path), {
      code: code === "ENOENT" ? "KEY_FILE_NOT_FOUND" : "KEY_FILE_UNREADABLE",
      suggestions:
        source === "config"
          ? ["point it elsewhere with `4mica config set key-file <path>`"]
          : undefined,
    });
  }
  const key = content.trim();
  if (key === "") {
    throw configError(`${where} is empty; it should hold the wallet key`, {
      code: "BAD_SIGNER",
    });
  }
  return { path: where, source, key };
}
