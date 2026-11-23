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

export const INIT_NOTICE =
  "No command was given, so this runs `4mica init`, as it always has. A " +
  "later release will print help instead; write `4mica init` to scaffold.";

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

/** The first word of every command, topic and alias. */
function firstWords({ commands }: Commands): string[] {
  return commands.flatMap((command) =>
    [command.id, ...(command.aliases ?? [])].map((id) => id.split(":")[0]),
  );
}

const HELP_FLAGS = new Set(["--help", "-h", "--version", "-v"]);

/**
 * Whether this is the old way of scaffolding: until 0.3 there was one
 * command and no word for it, so its flags and directory came first, as in
 * `4mica --yes` and `4mica my-app --no-install`. A word close to a real
 * command is left alone, so that a typo gets "did you mean" and not a
 * project named after it. Close means one slip for a short command and two
 * for a longer one: two slips from `dev` reach `demo` and `web`, which are
 * directory names.
 */
function meansInit(argv: string[], config: Commands): boolean {
  const [first] = argv;
  if (first.startsWith("-")) {
    // Nothing but flags: `hoistCommand` put any command in front of them.
    return first !== "--" && !argv.some((arg) => HELP_FLAGS.has(arg));
  }
  return !firstWords(config).some(
    (word) => distance(first, word) <= (word.length <= 4 ? 1 : 2),
  );
}

/**
 * Until 0.3 a bare `4mica` scaffolded a project. That still works, with a
 * notice, for the people and docs that rely on it. A bare `4mica` only in a
 * terminal: with no one to answer the prompts, help is the useful thing to
 * print. With flags or a directory it was already a script's way to
 * scaffold, so those work anywhere.
 */
export function normalizeArgv(
  argv: string[],
  config: Commands,
  interactive = process.stdin.isTTY === true && process.stderr.isTTY === true,
): string[] {
  const hoisted = hoistCommand(argv, config);
  if (hoisted.length === 0 ? !interactive : !meansInit(hoisted, config)) {
    return hoisted;
  }
  process.stderr.write(`${INIT_NOTICE}\n\n`);
  return ["init", ...hoisted];
}
