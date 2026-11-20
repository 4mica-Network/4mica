import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { packageRoot } from "../core/package-root.js";

export interface Outcome {
  stdout: string;
  /** Parsed stdout, when the command was run with `--json`. */
  json?: unknown;
  error?: { code?: string; oclif?: { exit?: number }; message: string };
}

/**
 * Runs a command class in-process, as `bin/run.js` would, against an empty
 * config directory and with no `FOURMICA_*` variables from the developer's
 * own shell.
 */
export async function runCommand(
  command: { run(argv: string[], root: string): Promise<unknown> },
  argv: string[],
  /** A config directory to reuse, when one command should see another's work. */
  home?: string,
): Promise<Outcome> {
  const dir = home ?? (await mkdtemp(join(tmpdir(), "4mica-cli-")));
  vi.stubEnv("XDG_CONFIG_HOME", dir);
  // An empty directory, so no developer's ./.env is picked up.
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  for (const key of Object.keys(process.env)) {
    if (/^(FOURMICA|4MICA)_/.test(key)) vi.stubEnv(key, undefined);
  }
  // oclif prints results through console.log.
  const lines: string[] = [];
  const write = vi.spyOn(console, "log").mockImplementation((...args) => {
    lines.push(args.join(" "));
  });
  // Confirmation summaries and spinners; not what these tests are about.
  const quiet = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const outcome: Outcome = { stdout: "" };
  try {
    await command.run(argv, packageRoot);
  } catch (error) {
    outcome.error = error as Outcome["error"];
  } finally {
    write.mockRestore();
    cwd.mockRestore();
    quiet.mockRestore();
    vi.unstubAllEnvs();
  }
  outcome.stdout = lines.join("\n");
  if (argv.includes("--json")) outcome.json = JSON.parse(outcome.stdout);
  return outcome;
}
