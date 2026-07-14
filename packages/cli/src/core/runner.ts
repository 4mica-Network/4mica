import { execa } from "execa";
import type { PackageManager } from "../types.js";
import { installArgs, runArgs } from "./package-manager.js";

/** Install dependencies in cwd with the given package manager. */
export async function install(pm: PackageManager, cwd: string): Promise<void> {
  await execa(pm, installArgs(pm), { cwd, stdio: "pipe" });
}

/**
 * Spawn a project script inheriting stdio. This blocks until the child exits,
 * so it must be the final foreground action of a command.
 */
export async function runScript(
  pm: PackageManager,
  script: string,
  cwd: string,
): Promise<void> {
  await execa(pm, runArgs(pm, script), { cwd, stdio: "inherit" });
}

/** Best-effort `git init` for a fresh scaffold; never fatal. */
export async function gitInit(cwd: string): Promise<void> {
  try {
    await execa("git", ["init", "-q"], { cwd });
    await execa("git", ["add", "-A"], { cwd });
  } catch {
    // git not installed or already a repo — ignore.
  }
}

/** Open a URL in the default browser (best-effort, cross-platform). */
export async function openBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    await execa(cmd, [url], { stdio: "ignore", detached: true });
  } catch {
    // headless / no browser — ignore.
  }
}
