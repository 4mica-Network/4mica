import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../../base.js";
import {
  readConfig,
  withSetting,
  writeConfig,
} from "../../core/config-file.js";
import { readKeyFile } from "../../core/key-file.js";
import { createWallet } from "../../core/wallets.js";
import { fields } from "../../ui/output.js";

export default class WalletsImport extends BaseCommand {
  static summary = "keep a key you already have as a named wallet";
  static description =
    "Copies the key into the cli's wallets, in a file only you can read. " +
    "The original file is left as it is. The key is taken from a file or " +
    "from stdin, never from a flag's value.";
  static args = {
    name: Args.string({ description: "what to call it", required: true }),
  };
  static flags = {
    "key-file": Flags.string({
      helpValue: "<path>",
      required: true,
      summary: "file holding the key; - reads it from stdin",
    }),
    use: Flags.boolean({
      allowNo: true,
      summary: "make it the wallet the cli uses",
    }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %> seller --key-file ./seller.key",
    "op read op://vault/agent/key | <%= config.bin %> <%= command.id %> agent --key-file - --use",
  ];

  async run() {
    const { args, flags } = await this.parse(WalletsImport);
    const dir = this.config.configDir;
    const config = await readConfig(dir);
    const source = await readKeyFile(flags["key-file"], "flag");
    const wallet = await createWallet(dir, args.name, {
      key: source.key,
      from: source.path,
    });
    const active = flags.use ?? !config["key-file"];
    if (active) {
      await writeConfig(dir, withSetting(config, "key-file", wallet.path));
    }
    this.log(
      fields([
        ["name", wallet.name],
        ["address", wallet.address],
        ["key file", wallet.path],
        ["in use", active ? "yes" : "no"],
      ]),
    );
    return { ...wallet, active };
  }
}
