import { Args } from "@oclif/core";
import { amountInput } from "../../core/amount.js";
import { confirmFunds } from "../../core/confirm.js";
import { beginSending } from "../../core/outcome.js";
import { previewWithdrawalRequest, renderPreview } from "../../core/preview.js";
import { withSession } from "../../core/session.js";
import { withdrawalFields } from "../../core/withdrawal.js";
import { asset, dryRun, yes } from "../../flags.js";
import { NetworkCommand } from "../../network-command.js";
import { step } from "../../ui/log.js";

export default class WithdrawalsRequest extends NetworkCommand {
  static summary = "request a withdrawal of available collateral";
  static description =
    "Starts the grace period. Nothing is paid out until " +
    "`withdrawals finalize` is run after it.";
  static aliases = ["withdraw"];
  static args = {
    amount: Args.string({
      description: 'in whole units, such as 5 or 0.10; "5 USDC" also works',
      required: true,
    }),
  };
  static flags = { asset, "dry-run": dryRun, yes };
  static examples = [
    "<%= config.bin %> <%= command.id %> 5 --asset USDC",
    "<%= config.bin %> withdraw 5 --asset USDC --yes",
  ];

  async run() {
    const { args, flags } = await this.parse(WithdrawalsRequest);
    const settings = await this.settings(flags);
    const amount = amountInput(args.amount, settings.asset);
    const label = `${amount.amount} ${amount.asset}`;

    return withSession(settings, async (client) => {
      const preview = await previewWithdrawalRequest(settings, client, amount);
      if (flags["dry-run"]) {
        this.log(renderPreview(preview));
        return preview;
      }

      await confirmFunds(preview, settings, flags);
      beginSending(`the withdrawal request for ${label}`, [
        "4mica withdrawals",
      ]);
      const result = await step(
        `Requesting a withdrawal of ${label}`,
        () => client.withdraw(amount),
        `Withdrawal of ${label} requested`,
      );
      this.log(withdrawalFields(result));
      this.note("run `4mica withdrawals` to see when it can be finalized");
      return result;
    });
  }
}
