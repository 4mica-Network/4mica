import { requireAsset } from "../../core/amount.js";
import { confirmFunds } from "../../core/confirm.js";
import { beginSending } from "../../core/outcome.js";
import { previewPendingWithdrawal } from "../../core/preview.js";
import { withSession } from "../../core/session.js";
import { withdrawalFields } from "../../core/withdrawal.js";
import { asset, dryRun, yes } from "../../flags.js";
import { NetworkCommand } from "../../network-command.js";
import { step } from "../../ui/log.js";

export default class WithdrawalsFinalize extends NetworkCommand {
  static summary = "pay out a withdrawal whose grace period has passed";
  static flags = { asset, "dry-run": dryRun, yes };
  static examples = [
    "<%= config.bin %> <%= command.id %> --asset USDC",
    "<%= config.bin %> <%= command.id %> --asset USDC --yes --json",
  ];

  async run() {
    const { flags } = await this.parse(WithdrawalsFinalize);
    const settings = await this.settings(flags);
    const name = requireAsset(settings.asset?.value);

    return withSession(settings, async (client) => {
      const preview = await previewPendingWithdrawal(
        settings,
        client,
        name,
        "finalize",
      );
      if (flags["dry-run"]) {
        this.showPreview(preview);
        return preview;
      }

      await confirmFunds(preview, settings, flags);
      beginSending(`the withdrawal payout of ${name}`, [
        "4mica withdrawals",
        "4mica balance",
      ]);
      const result = await step(
        `Finalizing the withdrawal of ${name}`,
        () => client.finalizeWithdrawal(name),
        `Withdrawal paid out: ${name}`,
      );
      this.log(withdrawalFields(result));
      return result;
    });
  }
}
