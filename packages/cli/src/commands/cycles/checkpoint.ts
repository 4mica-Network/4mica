import { Flags } from "@oclif/core";
import { requireAsset } from "../../core/amount.js";
import { formatAmount, resolveAsset } from "../../core/assets.js";
import { withSession } from "../../core/session.js";
import { asset } from "../../flags.js";
import { NetworkCommand } from "../../network-command.js";
import { waiting } from "../../ui/log.js";
import { fields } from "../../ui/output.js";

export default class CyclesCheckpoint extends NetworkCommand {
  static summary = "confirm the payments this wallet has made in a cycle";
  static description =
    "Signs a checkpoint over the payments made since the last one and " +
    "sends it to core. It moves no money: it restates what this wallet " +
    "already signed, after checking core's list against it. Core refuses " +
    "new payments with CHECKPOINT_REQUIRED until this is done.";
  static flags = {
    asset,
    cycle: Flags.string({
      helpValue: "<id>",
      summary: "a closed cycle, by the id a CHECKPOINT_REQUIRED error names",
    }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %> --asset USDC",
    "<%= config.bin %> <%= command.id %> --asset USDC --cycle 0x5f…",
  ];

  async run() {
    const { flags } = await this.parse(CyclesCheckpoint);
    const settings = await this.settings(flags);
    const name = requireAsset(settings.asset?.value);

    return withSession(settings, async (client) => {
      const token = await resolveAsset(settings, client, name);
      const { payment } = await client.lowLevel();
      const accepted = await waiting(
        `Confirming ${token.symbol} payments`,
        () =>
          flags.cycle
            ? payment.checkpointCycle(token.address, flags.cycle)
            : payment.checkpointActiveCycle(token.address),
      );
      if (!accepted) {
        this.note("nothing to confirm: no payments since the last checkpoint");
        return { asset: token.symbol, covered: 0 };
      }
      const total = await formatAmount(
        [token],
        token.address,
        accepted.cumulativeGross,
      );
      this.log(
        fields([
          ["cycle", accepted.cycleIdText],
          ["payments confirmed", String(accepted.covered)],
          ["total paid in this cycle", total],
        ]),
      );
      return accepted;
    });
  }
}
