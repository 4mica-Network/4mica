import ora, { type Ora } from "ora";
import pc from "picocolors";

/**
 * House terminal style — mirrors scripts/clean.ts: ora spinners with
 * picocolors success/failure text. Kept in one place so every command reads
 * the same.
 */

export const brand = (s: string) => pc.cyan(pc.bold(s));
export const dim = (s: string) => pc.dim(s);
export const ok = (s: string) => pc.green(s);
export const warn = (s: string) => pc.yellow(s);
export const err = (s: string) => pc.red(s);

export function spinner(text: string): Ora {
  return ora({ text, color: "cyan" }).start();
}

/** Run an async step under a spinner, succeeding/failing with house colors. */
export async function step<T>(
  text: string,
  fn: () => Promise<T>,
  doneText?: string,
): Promise<T> {
  const s = spinner(text);
  try {
    const result = await fn();
    s.succeed(ok(doneText ?? text));
    return result;
  } catch (error) {
    s.fail(err(`${text} — ${(error as Error).message}`));
    throw error;
  }
}

export { pc };
