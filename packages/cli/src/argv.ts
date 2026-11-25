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

/** The release that drops the pre-0.3 forms. */
export const LEGACY_INIT_REMOVED_IN = "0.5.0";

export const INIT_NOTICE =
  "No command was given, so this runs `4mica init`, as it always has. From " +
  `${LEGACY_INIT_REMOVED_IN} this prints help instead; write \`4mica init\` to scaffold.`;

/**
 * Edit distance, for telling a mistyped command from a directory name. Two
 * neighbouring letters swapped count as one slip, as they are at a keyboard.
 */
export function distance(a: string, b: string): number {
  let before: number[] = [];
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        row[j] + 1,
        next[j - 1] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        next[j] = Math.min(next[j], before[j - 2] + 1);
      }
    }
    before = row;
    row = next;
  }
  return row[b.length];
}

/**
 * The command a mistyped one was meant to be. oclif cannot tell where a
 * command it does not know ends, so `typed` runs on into the arguments:
 * `deposi 100`. Each command is compared with as many of the leading words
 * as it has itself, and one that accounts for more of them wins, so that
 * `withdrawals reqest` is `withdrawals request` and not `withdrawals`.
 */
export function nearestCommand(
  typed: string[],
  commands: string[],
): string | undefined {
  const [nearest] = commands
    .map((command) => {
      const words = command.split(" ").length;
      const d = distance(typed.slice(0, words).join(" "), command);
      return { command, words, d };
    })
    .filter(({ d }) => d <= 2)
    .sort((x, y) => y.words - x.words || x.d - y.d);
  return nearest?.command;
}

const HELP_FLAGS = new Set(["--help", "-h", "--version", "-v"]);

/**
 * Whether this is the old way of scaffolding: until 0.3 there was one
 * command and no word for it, so its flags came first, as in `4mica --yes`.
 * Those still scaffold, with a notice.
 *
 * A word is always a command, known or not: `4mica version` and `4mica
 * my-app` are unknown commands, never a project, so that adding a command
 * can never change what an old command line does. The not-found hook
 * points at `4mica init <word>`.
 */
function meansInit(argv: string[]): boolean {
  const [first] = argv;
  // Nothing but flags: `hoistCommand` put any command in front of them.
  return (
    first.startsWith("-") &&
    first !== "--" &&
    !argv.some((arg) => HELP_FLAGS.has(arg))
  );
}

/**
 * Until 0.3 a bare `4mica` scaffolded a project. That still works, with a
 * notice, for the people and docs that rely on it. A bare `4mica` only in a
 * terminal: with no one to answer the prompts, help is the useful thing to
 * print. With init's flags it was already a script's way to scaffold, so
 * those work anywhere.
 */
export function normalizeArgv(
  argv: string[],
  config: Commands,
  interactive = process.stdin.isTTY === true && process.stderr.isTTY === true,
): string[] {
  const hoisted = hoistCommand(argv, config);
  if (hoisted.length === 0 ? !interactive : !meansInit(hoisted)) {
    return hoisted;
  }
  process.stderr.write(`${INIT_NOTICE}\n\n`);
  return ["init", ...hoisted];
}
