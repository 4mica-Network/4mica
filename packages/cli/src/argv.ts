import type { Config } from "@oclif/core";

type Commands = Pick<Config, "commands">;

/** `--network` and `-a`: the flags whose next word is their value. */
function valueFlags({ commands }: Commands): Set<string> {
  const names = new Set<string>();
  for (const command of commands) {
    for (const [name, flag] of Object.entries(command.flags ?? {})) {
      if (flag.type !== "option") continue;
      names.add(`--${name}`);
      if (flag.char) names.add(`-${flag.char}`);
    }
  }
  return names;
}

/**
 * oclif takes the first word as the command, so `4mica --json networks`
 * would look for a command called `--json`. Flags typed before the command
 * are moved behind it, which makes the two orders mean the same thing.
 */
export function hoistCommand(argv: string[], config: Commands): string[] {
  const takesValue = valueFlags(config);
  let i = 0;
  while (i < argv.length && argv[i].startsWith("-") && argv[i] !== "--") {
    i += takesValue.has(argv[i]) ? 2 : 1;
  }
  // No flags in front, or nothing but flags (`4mica --help`): leave it be.
  if (i === 0 || i >= argv.length || argv[i] === "--") return argv;
  const rest = argv.slice(i);
  const passthrough = rest.indexOf("--");
  const end = passthrough === -1 ? rest.length : passthrough;
  return [...rest.slice(0, end), ...argv.slice(0, i), ...rest.slice(end)];
}

export const BARE_NOTICE =
  "`4mica` with no command starts `4mica init`, as it always has. A later " +
  "release will print help instead; run `4mica init` to scaffold.";

/**
 * Until 0.3 a bare `4mica` scaffolded a project. That still works, with a
 * notice, for the people and docs that rely on it. Only in a terminal: with
 * no one to answer the prompts, help is the useful thing to print.
 */
export function normalizeArgv(
  argv: string[],
  config: Commands,
  interactive = process.stdin.isTTY === true && process.stderr.isTTY === true,
): string[] {
  if (argv.length === 0 && interactive) {
    process.stderr.write(`${BARE_NOTICE}\n\n`);
    return ["init"];
  }
  return hoistCommand(argv, config);
}
