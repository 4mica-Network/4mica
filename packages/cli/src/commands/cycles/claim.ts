import { explorerTx, formatAmount, listAssets } from "../../core/assets.js";
import { confirmFunds } from "../../core/confirm.js";
import { beginSending } from "../../core/outcome.js";
import { previewCycleClaim, renderPreview } from "../../core/preview.js";
import { withSession } from "../../core/session.js";
import { address, cycleArg, dryRun, gas, yes } from "../../flags.js";
import { NetworkCommand } from "../../network-command.js";
import { step } from "../../ui/log.js";
import { fields } from "../../ui/output.js";

export default class CyclesClaim extends NetworkCommand {
  static summary = "collect what this wallet is owed for a closed cycle";
  static description =
    "Core works out one net amount per cycle. This collects it. The payout " +
    "goes to the address the cycle names, whoever sends the claim.";
  static args = {
    cycle: cycleArg,
  };
  static flags = {
    creditor: address({
      summary: "claim on behalf of another address; it still gets the payout",
    }),
    gas,
    "dry-run": dryRun,
    yes,
  };
  static examples = [
    "<%= config.bin %> <%= command.id %> 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913:1767225600 --dry-run",
    "<%= config.bin %> <%= command.id %> 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913:1767225600 --yes --json",
  ];

  async run() {
    const { args, flags } = await this.parse(CyclesClaim);
    const settings = await this.settings(flags);

    return withSession(settings, async (client) => {
      const { settlement } = await client.lowLevel();
      const claim = settlement.claim(args.cycle as string);
      const builder = flags.creditor ? claim.creditor(flags.creditor) : claim;
      // Core's own figure: the caller never states the amount.
      const terms = await builder.action();
      const assets = await listAssets(settings, client);
      const amount = await formatAmount(
        assets,
        terms.assetAddress,
        terms.amount,
      );

      const preview = await previewCycleClaim(
        settings,
        client,
        terms,
        assets,
        flags.gas,
      );
      if (flags["dry-run"]) {
        this.log(renderPreview(preview));
        return {
          ...preview,
          participant: terms.participant,
          amount,
          amountRaw: terms.amount,
        };
      }

      await confirmFunds(preview, settings, flags);
      beginSending(`the claim of ${amount} for cycle ${terms.cycleIdText}`, [
        "4mica cycles",
      ]);
      const receipt = await step(
        `Claiming ${amount}`,
        () =>
          flags.gas === "auto" ? builder.send() : builder.selfFunded().send(),
        `Claimed ${amount}`,
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
