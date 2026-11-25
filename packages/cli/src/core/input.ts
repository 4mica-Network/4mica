import { readFile } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { usageError } from "../errors.js";
import { note } from "../ui/log.js";
import { runtime } from "./runtime.js";

/**
 * A file's contents, or stdin for `-`. At a terminal, stdin waits for
 * typing, which looks like a hang unless it says so.
 */
export async function readInput(path: string): Promise<string> {
  if (path === "-") {
    if (process.stdin.isTTY === true) {
      if (runtime.noInput) {
        throw usageError("- reads stdin, which is a terminal here", {
          code: "STDIN_REQUIRED",
          suggestions: ["pipe the input in, or name a file"],
        });
      }
      note("reading from the terminal; end with Ctrl-D");
    }
    return text(process.stdin);
  }
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    throw usageError(`there is no file at ${path}`, { code: "FILE_NOT_FOUND" });
  }
}
