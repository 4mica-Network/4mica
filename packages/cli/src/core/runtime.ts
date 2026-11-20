/**
 * Flags every command honours, read once from argv before the command
 * parses, so that helpers far from the command can see them.
 */
export const runtime = { quiet: false, noInput: false };

export function readRuntimeFlags(argv: string[]): void {
  const flags = argv.includes("--") ? argv.slice(0, argv.indexOf("--")) : argv;
  runtime.quiet = flags.includes("--quiet") || flags.includes("-q");
  runtime.noInput = flags.includes("--no-input");
}

/** Whether a question can be put to a person. */
export const canPrompt = (): boolean =>
  process.stdin.isTTY === true && !runtime.noInput;
