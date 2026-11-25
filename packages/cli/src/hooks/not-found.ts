import type { Hook } from "@oclif/core";
import { nearestCommand } from "../argv.js";
import { errorJson, usageError } from "../errors.js";

/**
 * An unknown command is a usage error, with the nearest real one named.
 * No command is running to print `--json`, so this does: one JSON document
 * on stdout, like every other failure.
 */
const hook: Hook.CommandNotFound = async ({ argv, config, id }) => {
  const typed = id.split(":");
  const nearest = nearestCommand(
    typed,
    config.commandIDs.map((known) => known.replaceAll(":", " ")),
  );
  const error = usageError(`command ${typed.join(" ")} not found`, {
    code: "UNKNOWN_COMMAND",
    suggestions: nearest
      ? [`did you mean \`${config.bin} ${nearest}\`?`]
      : [
          `run \`${config.bin} --help\` to list commands`,
          // Before 0.3, `4mica my-app` scaffolded into my-app.
          `to scaffold a project in ${typed[0]}: \`${config.bin} init ${typed[0]}\``,
        ],
  });
  const args = argv ?? process.argv.slice(2);
  const end = args.indexOf("--");
  if ((end === -1 ? args : args.slice(0, end)).includes("--json")) {
    process.stdout.write(`${JSON.stringify(errorJson(error), null, 2)}\n`);
    throw Object.assign(error, { skipOclifErrorHandling: true });
  }
  throw error;
};

export default hook;
