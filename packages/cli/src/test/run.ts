import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { resetOutcome } from "../core/outcome.js";
import { packageRoot } from "../core/package-root.js";
import { setRuntimeFlags } from "../core/runtime.js";

export interface Outcome {
  stdout: string;
  /** Notes, summaries, warnings: everything written to stderr. */
  stderr: string;
  /** Parsed stdout, when the command was run with `--json`. */
  json?: unknown;
  error?: {
    code?: string;
    oclif?: { exit?: number };
    message: string;
    suggestions?: string[];
  };
}

/**
 * Runs a command class in-process, as `bin/run.js` would, against an empty
 * config directory and with no `FOURMICA_*` variables from the developer's
 * own shell. Each run starts from a fresh process's state: nothing sent,
 * no flags, the real `fetch`.
 */
export async function runCommand(
  command: { run(argv: string[], root: string): Promise<unknown> },
  argv: string[],
  /** A config directory to reuse, when one command should see another's work. */
  home?: string,
  env: Record<string, string> = {},
): Promise<Outcome> {
  const dir = home ?? (await mkdtemp(join(tmpdir(), "4mica-cli-")));
  vi.stubEnv("XDG_CONFIG_HOME", dir);
  // An empty directory, so no developer's ./.env is picked up.
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  for (const key of Object.keys(process.env)) {
    if (/^(FOURMICA|4MICA)_/.test(key)) vi.stubEnv(key, undefined);
  }
  vi.stubEnv("FOURMICA_CREDENTIAL_STORE", "file");
  for (const key of [
    "DEBUG",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
  ]) {
    vi.stubEnv(key, undefined);
  }
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  resetOutcome();
  setRuntimeFlags({});
  const fetchBefore = globalThis.fetch;
  // oclif prints results through console.log; `fetch` writes a response
  // body straight to stdout. Both are kept, in the order they were written.
  const printed: string[] = [];
  const write = vi.spyOn(console, "log").mockImplementation((...args) => {
    printed.push(`${args.join(" ")}\n`);
  });
  const stdout = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      printed.push(
        typeof chunk === "string"
          ? chunk
          : Buffer.from(chunk as Uint8Array).toString(),
      );
      return true;
    });
  const errors: string[] = [];
  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown) => {
      errors.push(String(chunk));
      return true;
    });
  const outcome: Outcome = { stdout: "", stderr: "" };
  try {
    await command.run(argv, packageRoot);
  } catch (error) {
    outcome.error = error as Outcome["error"];
  } finally {
    write.mockRestore();
    stdout.mockRestore();
    cwd.mockRestore();
    stderr.mockRestore();
    vi.unstubAllEnvs();
    globalThis.fetch = fetchBefore;
  }
  outcome.stdout = printed.join("").replace(/\n$/, "");
  outcome.stderr = errors.join("");
  if (argv.includes("--json")) outcome.json = JSON.parse(outcome.stdout);
  return outcome;
}
