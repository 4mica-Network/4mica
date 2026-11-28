import { Args } from "@oclif/core";
import { BaseCommand } from "../../base.js";
import { readContext, writeContext } from "../../core/config-file.js";
import { ENVIRONMENTS, requireEnvironment } from "../../core/workspace.js";

export default class EnvUse extends BaseCommand {
  static summary = "choose the environment the cli acts in";
  static description =
    "Sandbox and production keep a project's agents, APIs, keys and " +
    "webhooks apart. Saves the choice in the config file; --env or " +
    "FOURMICA_ENV still take precedence for a run.";
  static args = {
    environment: Args.string({
      description: ENVIRONMENTS.join(" or "),
      required: true,
    }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %> sandbox",
    "<%= config.bin %> <%= command.id %> production",
  ];

  async run() {
    const { args } = await this.parse(EnvUse);
    const environment = requireEnvironment(args.environment);
    const dir = this.config.configDir;
    await writeContext(dir, { ...(await readContext(dir)), environment });
    this.note(`now acting in ${environment}`);
    return { environment };
  }
}
