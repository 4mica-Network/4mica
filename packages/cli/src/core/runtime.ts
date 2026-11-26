/**
 * Flags every command honours, kept here once the command has parsed them,
 * so that helpers far from the command can see them.
 */
export const runtime = {
  quiet: false,
  noInput: false,
  debug: false,
  /**
   * A child process holds the terminal (`dev`, `init --run`): Ctrl-C is
   * meant for it, and this process only waits for it to stop.
   */
  childInForeground: false,
};

/** `DEBUG=4mica`, as the `debug` package spells it, or `FOURMICA_DEBUG=1`. */
export function debugFromEnv(env: Record<string, string | undefined>): boolean {
  const flag = env.FOURMICA_DEBUG;
  if (flag && flag !== "0" && flag !== "false") return true;
  return (env.DEBUG ?? "")
    .split(/[\s,]+/)
    .some((name) => name === "*" || /^4mica(\*|:|$)/.test(name));
}

/** From the parsed flags, not from argv: `-qy` is quiet too. */
export function setRuntimeFlags(flags: Record<string, unknown>): void {
  runtime.quiet = flags.quiet === true;
  runtime.noInput = flags["no-input"] === true;
  runtime.debug = flags.debug === true || debugFromEnv(process.env);
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
