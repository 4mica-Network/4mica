import { access } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { resolveRunContext } from "../core/context.js";
import { detectPackageManager } from "../core/package-manager.js";
import { openBrowser } from "../core/runner.js";
import { dim, ok, pc, warn } from "../ui/log.js";

export interface DashboardOptions {
  /** Open a browser once the dev server is up. */
  open?: boolean;
  /** Run detached so the caller can continue (used by `init`). */
  background?: boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Launch the 4Mica dashboard.
 *
 * In the monorepo we start the real `apps/dashboard` Vite dev server (hot
 * reload). When published outside the repo there is no dashboard to run yet —
 * v1 points the developer at the hosted/monorepo dashboard rather than
 * shipping a bundle.
 */
export async function launchDashboard(
  opts: DashboardOptions = {},
): Promise<void> {
  const context = await resolveRunContext();

  if (!context.inMonorepo || !context.monorepoRoot) {
    process.stdout.write(
      `\n  ${warn("Dashboard")} runs from the 4Mica monorepo in this release.\n` +
        `  Clone ${pc.cyan("github.com/4mica-Network/homepage")} and run ` +
        `${pc.bold("pnpm --filter @4mica/dashboard dev")},\n` +
        `  or use the hosted dashboard (coming soon). ${dim("More: 4mica.io/docs")}\n\n`,
    );
    return;
  }

  const dashboardDir = join(context.monorepoRoot, "apps", "dashboard");
  if (!(await exists(dashboardDir))) {
    process.stdout.write(
      `\n  ${warn("apps/dashboard not found in this checkout.")}\n\n`,
    );
    return;
  }

  const pm = await detectPackageManager(context.monorepoRoot);
  const args =
    pm === "yarn"
      ? ["workspace", "@4mica/dashboard", "dev"]
      : ["--filter", "@4mica/dashboard", "dev"];

  process.stdout.write(`\n  ${ok("Starting the 4Mica dashboard…")}\n\n`);

  if (opts.background) {
    const child = execa(pm, args, {
      cwd: context.monorepoRoot,
      stdio: "ignore",
      detached: true,
    });
    child.unref();
    if (opts.open) {
      // Vite's default dashboard port (see apps/dashboard/vite.config.ts).
      setTimeout(() => void openBrowser("http://localhost:4173"), 2500);
    }
    return;
  }

  const child = execa(pm, args, {
    cwd: context.monorepoRoot,
    stdio: "inherit",
  });
  if (opts.open) {
    setTimeout(() => void openBrowser("http://localhost:4173"), 2500);
  }
  await child;
}
