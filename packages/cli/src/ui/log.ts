import ora from "ora";
import picocolors from "picocolors";
import { runtime } from "../core/runtime.js";

/**
 * Whether to color what is written to a stream. Turning color off wins over
 * turning it on, a flag over a variable, and `FORCE_COLOR=0` (or `false`)
 * means off, as it does to Node: the name alone does not force anything.
 */
export function wantsColor(
  env: Record<string, string | undefined>,
  argv: readonly string[],
  isTTY: boolean,
): boolean {
  if (env.NO_COLOR || env.FOURMICA_NO_COLOR || argv.includes("--no-color")) {
    return false;
  }
  if (argv.includes("--color")) return true;
  const forced = env.FORCE_COLOR;
  if (forced) return forced !== "0" && forced !== "false";
  return isTTY && env.TERM !== "dumb";
}

/**
 * Color is decided per stream: a terminal's stderr keeps its colors while
 * stdout is piped to `jq`, and a redirected stderr gets no escape codes.
 */
const colorsFor = (stream: NodeJS.WriteStream) =>
  picocolors.createColors(
    wantsColor(process.env, process.argv, stream.isTTY === true),
  );

/** For results, on stdout. */
export const out = colorsFor(process.stdout);

/** For everything else, on stderr. */
export const pc = colorsFor(process.stderr);

export const brand = (s: string) => pc.cyan(pc.bold(s));
export const dim = (s: string) => pc.dim(s);
export const ok = (s: string) => pc.green(s);
export const warn = (s: string) => pc.yellow(s);
export const err = (s: string) => pc.red(s);

/** The spinner on screen, which a line written meanwhile must not tear. */
let active: ReturnType<typeof ora> | undefined;

/** A line on stderr, written around the spinner if one is turning. */
function line(message: string): void {
  if (active?.isSpinning) {
    active.clear();
    process.stderr.write(`${message}\n`);
    active.render();
  } else {
    process.stderr.write(`${message}\n`);
  }
}

/** A line of progress on stderr; `--quiet` drops it. */
export function note(message: string): void {
  if (!runtime.quiet) line(message);
}

/**
 * Something the user must see even with `--quiet`: a key others can read, a
 * transaction that has left. `--quiet` hides progress, not warnings.
 */
export function warning(message: string): void {
  line(warn(message));
}

/**
 * Diagnostics for `--debug` (or `DEBUG=4mica`): requests and stacks. Never
 * pass it a header value, a body or a key.
 */
export function debug(message: string): void {
  if (runtime.debug) line(dim(`[debug] ${message}`));
}

interface Progress {
  succeed(text: string): void;
  warn(text: string): void;
  fail(text: string): void;
  /** Ends the progress display, leaving nothing behind. */
  clear(): void;
}

/**
 * An animated spinner in a terminal. Elsewhere only the outcome is written,
 * as a plain line: no animation frames in a CI log.
 */
export function spinner(text: string): Progress {
  if (runtime.quiet) {
    // A warning is not progress: it still gets through.
    const warning = (t: string) => void process.stderr.write(`${t}\n`);
    return { succeed() {}, warn: warning, fail() {}, clear() {} };
  }
  if (!process.stderr.isTTY) {
    const line = (t: string) => void process.stderr.write(`${t}\n`);
    return { succeed: line, warn: line, fail: line, clear() {} };
  }
  const s = ora({ text, color: "cyan", stream: process.stderr }).start();
  active = s;
  const done = () => {
    if (active === s) active = undefined;
  };
  return {
    succeed(t) {
      done();
      s.succeed(ok(t));
    },
    warn(t) {
      done();
      s.warn(warn(t));
    },
    fail(t) {
      done();
      s.fail(err(t));
    },
    clear() {
      done();
      s.stop();
    },
  };
}

/**
 * Run an async step under a spinner. A failure only marks the step: the
 * error is rethrown for the command to report once, with its code.
 */
export async function step<T>(
  text: string,
  fn: () => Promise<T>,
  doneText?: string,
): Promise<T> {
  const s = spinner(text);
  try {
    const result = await fn();
    s.succeed(doneText ?? text);
    return result;
  } catch (error) {
    s.fail(text);
    throw error;
  }
}

/**
 * Something on screen while a request is out, gone once it is back. Only in
 * a terminal: a log has no use for "Connecting…".
 */
export async function waiting<T>(text: string, fn: () => Promise<T>) {
  if (!process.stderr.isTTY) return fn();
  const s = spinner(text);
  try {
    return await fn();
  } finally {
    s.clear();
  }
}
