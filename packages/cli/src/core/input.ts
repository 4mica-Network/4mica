import { readFile } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { usageError } from "../errors.js";

/** A file's contents, or stdin for `-`. */
export async function readInput(path: string): Promise<string> {
  if (path === "-") return text(process.stdin);
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    throw usageError(`there is no file at ${path}`, { code: "FILE_NOT_FOUND" });
  }
}
