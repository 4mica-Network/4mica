import { requireAsset } from "../../core/amount.js";
import { confirmFunds } from "../../core/confirm.js";
import { beginSending } from "../../core/outcome.js";
import { previewPendingWithdrawal } from "../../core/preview.js";
import { withSession } from "../../core/session.js";
import { withdrawalFields } from "../../core/withdrawal.js";
import { asset, dryRun, yes } from "../../flags.js";
import { NetworkCommand } from "../../network-command.js";
import { step } from "../../ui/log.js";

export default class WithdrawalsCancel extends NetworkCommand {
  static summary = "cancel a pending withdrawal";
  static flags = { asset, "dry-run": dryRun, yes };
  static examples = [
    "<%= config.bin %> <%= command.id %> --asset USDC",
    "<%= config.bin %> <%= command.id %> --asset USDC --yes --json",
  ];

  async run() {
    const { flags } = await this.parse(WithdrawalsCancel);
    const settings = await this.settings(flags);
    const name = requireAsset(settings.asset?.value);

    return withSession(settings, async (client) => {
      const preview = await previewPendingWithdrawal(
        settings,
        client,
        name,
        "cancel",
      );
      if (flags["dry-run"]) {
        this.showPreview(preview);
        return preview;
      }

      await confirmFunds(preview, settings, flags);
      beginSending(`the withdrawal cancellation of ${name}`, [
        "4mica withdrawals",
        "4mica balance",
      ]);
      const result = await step(
        `Cancelling the withdrawal of ${name}`,
        () => client.cancelWithdrawal(name),
        `Withdrawal cancelled: ${name}`,
      );
      this.log(withdrawalFields(result));
      return result;
    });
  }
}
