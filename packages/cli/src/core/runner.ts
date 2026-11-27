import { execa } from "execa";
import type { PackageManager } from "../types.js";
import { installArgs, runArgs } from "./package-manager.js";
import { runtime } from "./runtime.js";

/**
 * The environment for a package manager's install: without the wallet key.
 * An install runs every dependency's install script, which has no business
 * with it. The project's own scripts (`runScript`) do keep it: a buyer
 * started with `4mica dev` may be using an exported key.
 */
export function installEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const clean = { ...env };
  delete clean.FOURMICA_WALLET_PRIVATE_KEY;
  delete clean["4MICA_WALLET_PRIVATE_KEY"];
  return clean;
}

/** Install dependencies in cwd with the given package manager. */
export async function install(pm: PackageManager, cwd: string): Promise<void> {
  await execa(pm, installArgs(pm), {
    cwd,
    stdio: "pipe",
    env: installEnv(),
    extendEnv: false,
  });
}

/**
 * Spawn a project script inheriting stdio. This blocks until the child exits,
 * so it must be the final foreground action of a command. Ctrl-C meanwhile
 * is for the child: this process waits for it to stop.
 */
export async function runScript(
  pm: PackageManager,
  script: string,
  cwd: string,
): Promise<void> {
  runtime.childInForeground = true;
  try {
    await execa(pm, runArgs(pm, script), { cwd, stdio: "inherit" });
  } finally {
    runtime.childInForeground = false;
  }
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

/**
 * Open a URL in the default browser (best-effort, cross-platform). On
 * Windows `start` is built into cmd, not a program, and its first quoted
 * argument is a window title.
 */
export async function openBrowser(url: string): Promise<void> {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", '""', url]]
        : ["xdg-open", [url]];
  // Not awaited: with no desktop session, xdg-open runs $BROWSER in the
  // foreground and returns only when the browser closes, which would stall
  // `auth login` until its code had expired.
  try {
    const child = execa(cmd, args, { stdio: "ignore", detached: true });
    child.catch(() => {
      // headless / no browser — ignore.
    });
    child.unref();
  } catch {
    // headless / no browser — ignore.
  }
}
