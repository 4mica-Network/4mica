import type { Hook } from "@oclif/core";
import { distance } from "../argv.js";
import { usageError } from "../errors.js";

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
