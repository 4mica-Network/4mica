import { requireAsset } from "../../core/amount.js";
import { confirmFunds } from "../../core/confirm.js";
import { previewPendingWithdrawal, renderPreview } from "../../core/preview.js";
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
      if (flags["dry-run"]) {
        const preview = await previewPendingWithdrawal(
          settings,
          client,
          name,
          "finalize",
        );
        this.log(renderPreview(preview));
        return preview;
      }

      await confirmFunds(
        {
          action: `Finalize the withdrawal of ${name}`,
          address: client.address,
        },
        settings,
        flags,
      );
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
