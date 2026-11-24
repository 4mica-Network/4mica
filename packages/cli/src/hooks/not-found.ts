import type { Hook } from "@oclif/core";
import { nearestCommand } from "../argv.js";
import { usageError } from "../errors.js";

/** An unknown command is a usage error, with the nearest real one named. */
const hook: Hook.CommandNotFound = async ({ config, id }) => {
  const typed = id.split(":");
  const nearest = nearestCommand(
    typed,
    config.commandIDs.map((known) => known.replaceAll(":", " ")),
  );
  throw usageError(`command ${typed.join(" ")} not found`, {
    code: "UNKNOWN_COMMAND",
    suggestions: [
      nearest
        ? `did you mean \`${config.bin} ${nearest}\`?`
        : `run \`${config.bin} --help\` to list commands`,
    ],
  });
};

export default hook;
