import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../../base.js";
import { readConfig, writeConfig } from "../../core/config-file.js";
import { ask } from "../../core/confirm.js";
import { canPrompt } from "../../core/runtime.js";
import {
  findWallet,
  removeWallet,
  requireWalletName,
} from "../../core/wallets.js";
import { cancelled, usageError } from "../../errors.js";
import { warn } from "../../ui/log.js";

export default class WalletsRemove extends BaseCommand {
  static summary = "delete a wallet's key";
  static description =
    "Deletes the key file. There is no copy: funds and collateral at that " +
    "address can never be moved again unless the key is kept elsewhere. " +
    "Withdraw first. To confirm, the wallet's name has to be typed, or " +
    "passed to --confirm; --yes is not enough.";
  static args = {
    name: Args.string({
      description: "a name from `4mica wallets`",
      required: true,
    }),
  };
  static flags = {
    confirm: Flags.string({
      helpValue: "<name>",
      summary: "the wallet's name again, to delete without being asked",
    }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %> buyer-1",
    "<%= config.bin %> <%= command.id %> buyer-1 --confirm buyer-1",
  ];

  async run() {
    const { args, flags } = await this.parse(WalletsRemove);
    const dir = this.config.configDir;
    const name = requireWalletName(args.name);
    const wallet = await findWallet(dir, name);
    // A file with no usable key in it has no address to name.
    const what = wallet.address ?? `${wallet.path}, which is ${wallet.problem}`;

    let typed = flags.confirm;
    if (typed === undefined) {
      if (!canPrompt()) {
        throw usageError("deleting a key needs its name confirmed", {
          code: "CONFIRMATION_REQUIRED",
          suggestions: [`pass --confirm ${name}`],
        });
      }
      process.stderr.write(
        wallet.address
          ? `${warn(`This deletes the only copy of the key for ${wallet.address}.`)}\n` +
              "Anything that address holds stays there for good.\n"
          : `${warn(`This deletes ${what}.`)}\n`,
      );
      typed = await ask(`Type ${name} to delete it: `, {
        cancelMessage: "cancelled; nothing was deleted",
      });
      if (typed !== name) {
        throw cancelled("the name did not match; nothing was deleted");
      }
    }
    if (typed !== name) {
      // `--confirm` with the wrong name is a mistake in the command line.
      throw usageError("the name did not match; nothing was deleted", {
        code: "NAME_MISMATCH",
        suggestions: [`pass --confirm ${name}`],
      });
    }

    await removeWallet(wallet);
    // A config file pointing at a deleted key would fail every command.
    const { "key-file": active, ...rest } = await readConfig(dir);
    const wasActive = active === wallet.path;
    if (wasActive) await writeConfig(dir, rest);
    this.note(
      `deleted ${wallet.name} (${what})` +
        (wasActive ? "; the cli has no wallet in use now" : ""),
    );
    return { ...wallet, removed: true, wasActive };
  }
}
