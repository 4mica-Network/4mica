import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../../base.js";
import {
  readConfig,
  withSetting,
  writeConfig,
} from "../../core/config-file.js";
import { fundingSteps, renderSteps } from "../../core/next-steps.js";
import { createWallet } from "../../core/wallets.js";
import { fields } from "../../ui/output.js";

export default class WalletsCreate extends BaseCommand {
  static summary = "create a wallet: a new private key in a file of its own";
  static description =
    "The key is written to a file only you can read and is never printed. " +
    "Nothing is sent anywhere: a wallet exists on a network once it is " +
    "funded. The first wallet becomes the one the cli uses; later ones do " +
    "only with --use. An existing wallet is never overwritten.";
  static args = {
    name: Args.string({
      default: "default",
      description: "what to call it, such as buyer-1",
    }),
  };
  static flags = {
    use: Flags.boolean({
      allowNo: true,
      summary: "make it the wallet the cli uses",
    }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> buyer-1 --use",
    "<%= config.bin %> <%= command.id %> seller --json",
  ];

  async run() {
    const { args, flags } = await this.parse(WalletsCreate);
    const dir = this.config.configDir;
    const config = await readConfig(dir);
    const wallet = await createWallet(dir, args.name);

    // Switching wallets changes whose money a later command moves, so it
    // happens only when there was no wallet to switch away from, or on ask.
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
    const nextSteps = [
      ...(active
        ? []
        : [
            {
              done: false,
              step: "switch to it",
              command: `4mica wallets use ${wallet.name}`,
            },
          ]),
      ...fundingSteps(wallet.address),
    ];
    this.note(`\n${renderSteps(nextSteps)}`);
    return { ...wallet, active, nextSteps };
  }
}
