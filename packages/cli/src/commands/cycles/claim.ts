import { Args, Flags } from "@oclif/core";
import { explorerTx, formatAmount, listAssets } from "../../core/assets.js";
import { confirmFunds } from "../../core/confirm.js";
import { withSession } from "../../core/session.js";
import { networkName } from "../../core/settings.js";
import { dryRun, yes } from "../../flags.js";
import { NetworkCommand } from "../../network-command.js";
import { step } from "../../ui/log.js";
import { fields } from "../../ui/output.js";

export default class CyclesClaim extends NetworkCommand {
  static summary = "collect what this wallet is owed for a closed cycle";
  static description =
    "Core works out one net amount per cycle. This collects it. The payout " +
    "goes to the address the cycle names, whoever sends the claim.";
  static args = {
    cycle: Args.string({
      description: "the cycle, as `4mica cycles` names it",
      required: true,
    }),
  };
  static flags = {
    creditor: Flags.string({
      helpValue: "<address>",
      summary: "claim on behalf of another address; it still gets the payout",
    }),
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
    const { args, flags } = await this.parse(CyclesClaim);
    const settings = await this.settings(flags);

    return withSession(settings, async (client) => {
      const { settlement } = await client.lowLevel();
      const claim = settlement.claim(args.cycle);
      const builder = flags.creditor ? claim.creditor(flags.creditor) : claim;
      // Core's own figure: the caller never states the amount.
      const terms = await builder.action();
      const amount = await formatAmount(
        await listAssets(settings, client),
        terms.assetAddress,
        terms.amount,
      );

      if (flags["dry-run"]) {
        const preview = {
          dryRun: true,
          action: `claim ${amount} for cycle ${terms.cycleIdText}`,
          network: networkName(settings),
          wallet: client.address,
          participant: terms.participant,
          amount,
          amountRaw: terms.amount,
        };
        this.log(
          fields([
            ["would", preview.action],
            ["network", preview.network],
            ["wallet", preview.wallet],
            ["for", preview.participant],
            ["ready", "yes, nothing was sent"],
          ]),
        );
        return preview;
      }

      await confirmFunds(
        {
          action: `Claim ${amount} for cycle ${terms.cycleIdText}`,
          address: client.address,
          details: [["for", terms.participant]],
        },
        settings,
        flags,
      );
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
