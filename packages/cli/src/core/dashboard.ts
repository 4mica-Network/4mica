import { access } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { failure } from "../errors.js";
import { resolveRunContext } from "./context.js";
import { detectPackageManager } from "./package-manager.js";
import { openBrowser } from "./runner.js";

/** The hosted dashboard. */
export const DASHBOARD_URL = "https://app.4mica.io";

// Vite's port for the dashboard (see apps/dashboard/vite.config.ts).
const LOCAL_URL = "http://localhost:4173";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Starts the `apps/dashboard` dev server from a checkout of the monorepo and
 * blocks until it exits. The published CLI ships no dashboard of its own.
 */
export async function runLocalDashboard(opts: {
  open: boolean;
}): Promise<void> {
  const { monorepoRoot } = await resolveRunContext();
  if (
    !monorepoRoot ||
    !(await exists(join(monorepoRoot, "apps", "dashboard")))
  ) {
    throw failure("--local needs a checkout of the 4mica monorepo", {
      code: "LOCAL_DASHBOARD_UNAVAILABLE",
      suggestions: [`leave out --local to use ${DASHBOARD_URL}`],
    });
  }

  const pm = await detectPackageManager(monorepoRoot);
  const args =
    pm === "yarn"
      ? ["workspace", "@4mica/dashboard", "dev"]
      : ["--filter", "@4mica/dashboard", "dev"];
  const child = execa(pm, args, { cwd: monorepoRoot, stdio: "inherit" });
  if (opts.open) setTimeout(() => void openBrowser(LOCAL_URL), 2500);
  await child;
}
