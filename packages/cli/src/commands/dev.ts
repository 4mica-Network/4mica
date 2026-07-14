import { detectPackageManager } from "../core/package-manager.js";
import { runScript } from "../core/runner.js";

/**
 * Run the current project's dev server with the detected package manager.
 * A thin convenience wrapper around `<pm> run dev`.
 */
export async function devCommand(script = "dev"): Promise<void> {
  const cwd = process.cwd();
  const pm = await detectPackageManager(cwd);
  await runScript(pm, script, cwd);
}
