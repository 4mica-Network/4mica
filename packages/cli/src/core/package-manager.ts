import { findUp } from "find-up";
import type { PackageManager } from "../types.js";

const LOCKFILES: Record<string, PackageManager> = {
  "pnpm-lock.yaml": "pnpm",
  "package-lock.json": "npm",
  "yarn.lock": "yarn",
  "bun.lockb": "bun",
  "bun.lock": "bun",
};

/** Read the PM that invoked us (set by npx / pnpm dlx / yarn dlx). */
function fromUserAgent(): PackageManager | undefined {
  const ua = process.env.npm_config_user_agent;
  if (!ua) return undefined;
  const name = ua.split("/")[0];
  if (name === "pnpm" || name === "npm" || name === "yarn" || name === "bun") {
    return name;
  }
  return undefined;
}

async function fromLockfile(cwd: string): Promise<PackageManager | undefined> {
  const found = await findUp(Object.keys(LOCKFILES), { cwd });
  if (!found) return undefined;
  const file = found.slice(found.lastIndexOf("/") + 1);
  return LOCKFILES[file];
}

/**
 * Resolve the package manager: explicit override → invoking agent →
 * nearest lockfile → pnpm (repo default).
 */
export async function detectPackageManager(
  cwd: string,
  override?: PackageManager,
): Promise<PackageManager> {
  return override ?? fromUserAgent() ?? (await fromLockfile(cwd)) ?? "pnpm";
}

export function installArgs(_pm: PackageManager): string[] {
  return ["install"];
}

export function runArgs(pm: PackageManager, script: string): string[] {
  // yarn runs scripts without the `run` keyword.
  return pm === "yarn" ? [script] : ["run", script];
}
