import { readFile, stat } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { configError, usageError } from "../errors.js";
import { warning } from "../ui/log.js";
import { ask } from "./confirm.js";
import { canPrompt, runtime } from "./runtime.js";
import type { KeyFile } from "./settings.js";

/** Why a key file gave no key, by Node's name for the failure. */
const UNREADABLE: Record<string, (path: string) => string> = {
  ENOENT: (path) => `there is no key file at ${path}`,
  EISDIR: (path) => `${path} is a directory, not a key file`,
  EACCES: (path) => `no permission to read ${path}`,
};

/**
 * `-`: piped in (`op read … | 4mica … --key-file -`), or typed at a
 * terminal, where it is read without echo so that it never reaches the
 * screen or the scrollback.
 */
async function keyFromStdin(): Promise<string> {
  if (process.stdin.isTTY !== true) return text(process.stdin);
  if (!canPrompt()) {
    throw usageError(
      "--key-file - reads the key from stdin, which is a terminal here",
      {
        code: "STDIN_REQUIRED",
        suggestions: [
          runtime.noInput
            ? "pipe the key in, or drop --no-input to type it"
            : "pipe the key in: `op read <ref> | 4mica … --key-file -`",
        ],
      },
    );
  }
  return ask("Wallet key (input hidden): ", {
    hidden: true,
    cancelMessage: "cancelled; no key was read",
  });
}

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
      content = await keyFromStdin();
    } else {
      // Like ssh, object to a key others can read; unlike ssh, still use it.
      // Not hidden by --quiet: it is a warning, not progress.
      const { mode } = await stat(path);
      if (process.platform !== "win32" && (mode & 0o077) !== 0) {
        warning(`${path} is readable by other users; run: chmod 600 ${path}`);
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
