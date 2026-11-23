/**
 * Flags every command honours, kept here once the command has parsed them,
 * so that helpers far from the command can see them.
 */
export const runtime = { quiet: false, noInput: false };

/** From the parsed flags, not from argv: `-qy` is quiet too. */
export function setRuntimeFlags(flags: Record<string, unknown>): void {
  runtime.quiet = flags.quiet === true;
  runtime.noInput = flags["no-input"] === true;
}

/**
 * Whether a question can be put to a person. Questions are written to
 * stderr and answered on stdin, so both have to be a terminal: with stderr
 * in a file the command would wait on a question nobody can see.
 */
export const canPrompt = (): boolean =>
  process.stdin.isTTY === true &&
  process.stderr.isTTY === true &&
  !runtime.noInput;
