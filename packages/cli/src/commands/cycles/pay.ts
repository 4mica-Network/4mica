import { Args, Flags } from "@oclif/core";
import { explorerTx, formatAmount, listAssets } from "../../core/assets.js";
import { confirmFunds } from "../../core/confirm.js";
import { previewCyclePay, renderPreview } from "../../core/preview.js";
import { withSession } from "../../core/session.js";
import { dryRun, yes } from "../../flags.js";
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
    cycle: Args.string({
      description: "the cycle, as `4mica cycles` names it",
      required: true,
    }),
  };
  static flags = {
    gas: Flags.string({
      default: "auto",
      options: ["auto", "self"],
      summary: "auto uses a sponsored transaction when one is available",
    }),
    "dry-run": dryRun,
    yes,
  };
  static examples = [
    "<%= config.bin %> <%= command.id %> <cycle> --dry-run",
    "<%= config.bin %> <%= command.id %> <cycle> --yes --json",
  ];

  async run() {
    const { args, flags } = await this.parse(CyclesPay);
    const settings = await this.settings(flags);

    return withSession(settings, async (client) => {
      const { settlement } = await client.lowLevel();
      const builder = settlement.pay(args.cycle);
      // Core's own figure: the caller never states the amount.
      const terms = await builder.action();
      const assets = await listAssets(settings, client);
      const amount = await formatAmount(
        assets,
        terms.assetAddress,
        terms.amount,
      );

      if (flags["dry-run"]) {
        const preview = await previewCyclePay(
          settings,
          client,
          terms,
          assets,
          flags.gas as "auto" | "self",
        );
        this.log(renderPreview(preview));
        return {
          ...preview,
          participant: terms.participant,
          amount,
          amountRaw: terms.amount,
        };
      }

      await confirmFunds(
        {
          action: `Pay ${amount} for cycle ${terms.cycleIdText}`,
          address: client.address,
          details: [["for", terms.participant]],
        },
        settings,
        flags,
      );
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
        amount,
        amountRaw: terms.amount,
      };
    });
  }
}
