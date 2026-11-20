import { Args } from "@oclif/core";
import { BaseCommand } from "../../base.js";
import {
  CONFIG_KEYS,
  readConfig,
  requireConfigKey,
} from "../../core/config-file.js";
import { failure } from "../../errors.js";

export default class ConfigGet extends BaseCommand {
  static summary = "print one setting from the config file";
  static description =
    "Exits 1 when the setting is not in the file. To see the value in " +
    "effect, whatever its source, run `4mica config`.";
  static args = {
    key: Args.string({ description: CONFIG_KEYS.join(", "), required: true }),
  };
  static examples = ["<%= config.bin %> <%= command.id %> network"];

  async run() {
    const { args } = await this.parse(ConfigGet);
    const key = requireConfigKey(args.key);
    const value = (await readConfig(this.config.configDir))[key];
    if (value === undefined) {
      throw failure(`${key} is not set in the config file`, {
        code: "SETTING_NOT_SET",
        suggestions: [`set it with \`4mica config set ${key} <value>\``],
      });
    }
    this.log(value);
    return { key, value };
  }
}
