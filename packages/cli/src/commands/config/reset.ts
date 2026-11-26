import { Flags } from "@oclif/core";
import { BaseCommand } from "../../base.js";
import { configPath, readConfig, writeConfig } from "../../core/config-file.js";
import { ask } from "../../core/confirm.js";
import { canPrompt } from "../../core/runtime.js";
import { cancelled, usageError } from "../../errors.js";

export default class ConfigReset extends BaseCommand {
  static summary = "remove every setting from the config file";
  static description =
    "Puts every setting back to its default. Wallet keys are kept: they " +
    "are files of their own, which `4mica wallets` lists. The wallet in " +
    "use is forgotten, so `4mica wallets use <name>` picks one again.";
  static flags = {
    yes: Flags.boolean({ char: "y", summary: "reset without asking" }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --yes",
  ];

  async run() {
    const { flags } = await this.parse(ConfigReset);
    const dir = this.config.configDir;
    // Read leniently: a file that is not JSON is the usual reason to reset.
    const removed = await readConfig(dir).then(
      (config) => Object.keys(config),
      () => ["(unreadable file)"],
    );
    if (!flags.yes) {
      if (!canPrompt()) {
        throw usageError("resetting the settings needs confirming", {
          code: "CONFIRMATION_REQUIRED",
          suggestions: ["pass --yes to reset without asking"],
        });
      }
      const answer = await ask(
        `Remove every setting from ${configPath(dir)}? Wallet keys are kept. [y/N] `,
        { cancelMessage: "cancelled; nothing was changed" },
      );
      if (!/^y(es)?$/i.test(answer)) {
        throw cancelled("cancelled; nothing was changed");
      }
    }
    await writeConfig(dir, {}, { reset: true });
    this.note(
      removed.length === 0
        ? "nothing was set; the settings are the defaults"
        : `removed ${removed.join(", ")} from ${configPath(dir)}`,
    );
    return { removed };
  }
}
