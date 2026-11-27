import { Flags } from "@oclif/core";
import { requireAsset } from "../../core/amount.js";
import { formatAmount, resolveAsset } from "../../core/assets.js";
import { confirmFunds } from "../../core/confirm.js";
import { beginSending } from "../../core/outcome.js";
import { withSession } from "../../core/session.js";
import { networkName } from "../../core/settings.js";
import { asset, dryRun, requireCycleId, yes } from "../../flags.js";
import { NetworkCommand } from "../../network-command.js";
import { waiting } from "../../ui/log.js";
import { fields } from "../../ui/output.js";

export default class CyclesCheckpoint extends NetworkCommand {
  static summary = "confirm the payments this wallet has made in a cycle";
  static description =
    "Signs a checkpoint over the payments made since the last one and " +
    "sends it to core. It moves no money: it restates what this wallet " +
    "already signed, after checking core's list against it. Core refuses " +
    "new payments with CHECKPOINT_REQUIRED until this is done.\n\n" +
    "It is still a signed statement of what the wallet has paid, so it is " +
    "shown and confirmed first, like a payment. --dry-run shows it and " +
    "signs nothing.";
  static flags = {
    asset,
    cycle: Flags.string({
      helpValue: "<id>",
      parse: async (value) => requireCycleId(value),
      summary: "a closed cycle, by the id a CHECKPOINT_REQUIRED error names",
    }),
    "dry-run": dryRun,
    yes,
  };
  static examples = [
    "<%= config.bin %> <%= command.id %> --asset USDC --dry-run",
    "<%= config.bin %> <%= command.id %> --asset USDC --yes",
    "<%= config.bin %> <%= command.id %> --asset USDC --cycle 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913:1767225600",
  ];

  async run() {
    const { flags } = await this.parse(CyclesCheckpoint);
    const settings = await this.settings(flags);
    const name = requireAsset(settings.asset?.value);

    return withSession(settings, async (client) => {
      const token = await resolveAsset(settings, client, name);
      const { payment } = await client.lowLevel();
      // What core would have this wallet sign: read, not signed.
      const batch = await waiting(`Reading ${token.symbol} payments`, () =>
        flags.cycle
          ? payment.checkpointBatchForCycle(token.address, flags.cycle)
          : payment.checkpointBatch(token.address),
      );
      const count = batch.authorizations.length;
      const sum = batch.authorizations.reduce(
        (total, a) => total + a.payload.amount,
        0n,
      );
      const covering = await formatAmount([token], token.address, sum);
      const cycle = batch.cycleIdText || batch.cycleId;

      if (count === 0) {
        this.note("nothing to confirm: no payments since the last checkpoint");
        return { asset: token.symbol, cycle, covered: 0 };
      }

      const preview = {
        dryRun: true as const,
        action: `sign a checkpoint over ${count} payment${count === 1 ? "" : "s"} in cycle ${cycle}`,
        network: networkName(settings),
        wallet: client.address,
        details: {
          token: `${token.symbol} (${token.address})`,
          payments: String(count),
          newSinceLastCheckpoint: covering,
          baseUnits: sum.toString(),
        },
        problems: [],
        ready: true,
      };
      if (flags["dry-run"]) {
        this.showPreview(preview);
        return preview;
      }

      await confirmFunds(preview, settings, flags);
      beginSending(`the checkpoint for cycle ${cycle}`, ["4mica cycles"]);
      const accepted = await waiting(
        `Confirming ${token.symbol} payments`,
        () => payment.checkpointCycle(token.address, batch.cycleId),
      );
      if (!accepted) {
        this.note("nothing to confirm: no payments since the last checkpoint");
        return { asset: token.symbol, cycle, covered: 0 };
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
      // The same three fields as when there was nothing to confirm.
      return { asset: token.symbol, cycle: accepted.cycleIdText, ...accepted };
    });
  }
}
