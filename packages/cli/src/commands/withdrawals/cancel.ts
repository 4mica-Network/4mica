import { requireAsset } from "../../core/amount.js";
import { confirmFunds } from "../../core/confirm.js";
import { previewPendingWithdrawal, renderPreview } from "../../core/preview.js";
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
      if (flags["dry-run"]) {
        const preview = await previewPendingWithdrawal(
          settings,
          client,
          name,
          "cancel",
        );
        this.log(renderPreview(preview));
        return preview;
      }

      await confirmFunds(
        { action: `Cancel the withdrawal of ${name}`, address: client.address },
        settings,
        flags,
      );
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
