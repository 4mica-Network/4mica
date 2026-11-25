import {
  amountFields,
  explorerTx,
  formatAmount,
  listAssets,
} from "../../core/assets.js";
import { confirmFunds } from "../../core/confirm.js";
import { beginSending } from "../../core/outcome.js";
import { previewCyclePay } from "../../core/preview.js";
import { withSession } from "../../core/session.js";
import { cycleArg, dryRun, gas, yes } from "../../flags.js";
import { NetworkCommand } from "../../network-command.js";
import { step } from "../../ui/log.js";
import { fields } from "../../ui/output.js";

export default class CyclesPay extends NetworkCommand {
  static summary = "pay what this wallet owes for a closed cycle";
  static description =
    "Core works out one net amount per cycle. This pays it, with the proof " +
    "the contract checks. --dry-run shows the amount and whether this " +
    "wallet can pay it, without paying.";
  static args = {
    cycle: cycleArg,
  };
  static flags = {
    gas,
    "dry-run": dryRun,
    yes,
  };
  static examples = [
    "<%= config.bin %> <%= command.id %> 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913:1767225600 --dry-run",
    "<%= config.bin %> <%= command.id %> 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913:1767225600 --yes --json",
  ];

  async run() {
    const { args, flags } = await this.parse(CyclesPay);
    const settings = await this.settings(flags);

    return withSession(settings, async (client) => {
      const { settlement } = await client.lowLevel();
      const builder = settlement.pay(args.cycle as string);
      // Core's own figure: the caller never states the amount.
      const terms = await builder.action();
      const assets = await listAssets(settings, client);
      const amount = await formatAmount(
        assets,
        terms.assetAddress,
        terms.amount,
      );
      // For --json: the number, its unit and the base units, each its own.
      const money = await amountFields(
        assets,
        terms.assetAddress,
        terms.amount,
      );

      const preview = await previewCyclePay(
        settings,
        client,
        terms,
        assets,
        flags.gas,
      );
      if (flags["dry-run"]) {
        this.showPreview(preview);
        return {
          ...preview,
          participant: terms.participant,
          ...money,
        };
      }

      await confirmFunds(preview, settings, flags);
      beginSending(`the payment of ${amount} for cycle ${terms.cycleIdText}`, [
        "4mica cycles",
      ]);
      const receipt = await step(
        `Paying ${amount}`,
        async () => {
          if (flags.gas === "auto") return builder.send();
          const own = builder.selfFunded();
          // A native debit rides with the transaction; a token needs approval.
          if (!/^0x0+$/.test(terms.assetAddress)) await own.approve();
          return own.send();
        },
        `Paid ${amount}`,
      );
      this.log(
        fields([
          ["cycle", terms.cycleIdText],
          ["amount", amount],
          ["transaction", receipt.txHash],
          ["explorer", explorerTx(settings, receipt.txHash)],
        ]),
      );
      const { raw: _, ...result } = receipt;
      return {
        ...result,
        cycle: terms.cycleIdText,
        ...money,
      };
    });
  }
}
