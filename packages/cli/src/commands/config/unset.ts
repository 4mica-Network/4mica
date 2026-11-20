import { Args } from "@oclif/core";
import { BaseCommand } from "../../base.js";
import {
  CONFIG_KEYS,
  configPath,
  readConfig,
  requireConfigKey,
  writeConfig,
} from "../../core/config-file.js";

export default class ConfigUnset extends BaseCommand {
  static summary = "remove a setting from the config file";
  static args = {
    key: Args.string({ description: CONFIG_KEYS.join(", "), required: true }),
  };
  static examples = ["<%= config.bin %> <%= command.id %> asset"];

  async run() {
    const { args } = await this.parse(ConfigUnset);
    const key = requireConfigKey(args.key);
    const dir = this.config.configDir;
    const { [key]: removed, ...rest } = await readConfig(dir);
    if (removed !== undefined) await writeConfig(dir, rest);
    this.note(`${key} removed from ${configPath(dir)}`);
    return { key, removed: removed !== undefined };
  }
}
