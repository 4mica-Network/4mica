import { Args } from "@oclif/core";
import { BaseCommand } from "../../base.js";
import {
  readConfig,
  withSetting,
  writeConfig,
} from "../../core/config-file.js";
import { listWallets, requireWalletName } from "../../core/wallets.js";
import { usageError } from "../../errors.js";

export default class WalletsUse extends BaseCommand {
  static summary = "make a wallet the one the cli uses";
  static description =
    "Sets `key-file` in the config file. A key in --key-file, in the " +
    "environment or in ./.env still takes precedence for that run.";
  static args = {
    name: Args.string({
      description: "a name from `4mica wallets`",
      required: true,
    }),
  };
  static examples = ["<%= config.bin %> <%= command.id %> buyer-1"];

  async run() {
    const { args } = await this.parse(WalletsUse);
    const dir = this.config.configDir;
    const name = requireWalletName(args.name);
    const wallet = (await listWallets(dir)).find((w) => w.name === name);
    if (!wallet) {
      throw usageError(`there is no wallet named ${name}`, {
        code: "WALLET_NOT_FOUND",
        suggestions: ["see the ones you have with `4mica wallets`"],
      });
    }
    await writeConfig(
      dir,
      withSetting(await readConfig(dir), "key-file", wallet.path),
    );
    this.note(`now using ${wallet.name} (${wallet.address})`);
    return { ...wallet, active: true };
  }
}
