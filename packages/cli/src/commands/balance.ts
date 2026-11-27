import type { Balance } from "@4mica/sdk";
import { Args } from "@oclif/core";
import { withSession } from "../core/session.js";
import { networkName } from "../core/settings.js";
import { NetworkCommand } from "../network-command.js";
import { table } from "../ui/output.js";

export default class BalanceCommand extends NetworkCommand {
  static summary = "show collateral: total, locked and available";
  static description =
    "Locked collateral backs guarantees that have not cleared yet. Only " +
    "the available part can be spent or withdrawn. With --json the result " +
    "is always a list, one entry per asset, each naming its network.";
  static args = {
    asset: Args.string({
      description: "show one asset: a symbol, ETH, or a token address",
    }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> USDC --network base",
    "<%= config.bin %> <%= command.id %> --json",
  ];

  async run() {
    const { args, flags } = await this.parse(BalanceCommand);
    const settings = await this.settings(flags);
    return withSession(settings, async (client) => {
      const result = args.asset
        ? await client.balance(args.asset)
        : await client.balance();
      const balances: Balance[] = args.asset
        ? [result as Balance]
        : Object.values(result);
      this.note(`network: ${networkName(settings)}`);
      this.log(
        table(
          ["ASSET", "TOTAL", "LOCKED", "AVAILABLE"],
          balances.map((b) => [b.asset.symbol, b.total, b.locked, b.available]),
        ),
      );
      if (balances.length === 0) {
        this.note(`no collateral on ${networkName(settings)} for this wallet`);
      }
      const network = networkName(settings);
      return balances.map((b) => ({ ...b, network }));
    });
  }
}
