import type { Hook } from "@oclif/core";
import { usageError } from "../errors.js";

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        row[j] + 1,
        next[j - 1] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    row = next;
  }
  return row[b.length];
}

/** An unknown command is a usage error, with the nearest real one named. */
const hook: Hook.CommandNotFound = async ({ config, id }) => {
  const typed = id.replaceAll(":", " ");
  const [nearest] = config.commandIDs
    .map((known) => known.replaceAll(":", " "))
    .map((known) => ({ known, d: distance(typed, known) }))
    .filter(({ d }) => d <= 2)
    .sort((x, y) => x.d - y.d);
  throw usageError(`command ${typed} not found`, {
    code: "UNKNOWN_COMMAND",
    suggestions: [
      nearest
        ? `did you mean \`${config.bin} ${nearest.known}\`?`
        : `run \`${config.bin} --help\` to list commands`,
    ],
  });
};

export default hook;
