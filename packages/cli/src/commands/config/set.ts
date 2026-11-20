import { Args } from "@oclif/core";
import { BaseCommand } from "../../base.js";
import {
  CONFIG_KEYS,
  configPath,
  readConfig,
  requireConfigKey,
  withSetting,
  writeConfig,
} from "../../core/config-file.js";

export default class ConfigSet extends BaseCommand {
  static summary = "save a setting to the config file";
  static description =
    "`network` and `rpc-url` both choose the core to talk to, so setting " +
    "one removes the other. The wallet key is never stored here.";
  static args = {
    key: Args.string({ description: CONFIG_KEYS.join(", "), required: true }),
    value: Args.string({ required: true }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %> network base-sepolia",
    "<%= config.bin %> <%= command.id %> asset USDC",
  ];

  async run() {
    const { args } = await this.parse(ConfigSet);
    const key = requireConfigKey(args.key);
    const dir = this.config.configDir;
    const config = withSetting(await readConfig(dir), key, args.value);
    await writeConfig(dir, config);
    this.note(`${key} set to ${config[key]} in ${configPath(dir)}`);
    return { key, value: config[key] };
  }
}
