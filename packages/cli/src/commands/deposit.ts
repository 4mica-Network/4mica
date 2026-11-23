import { Args, Flags } from "@oclif/core";
import { amountInput } from "../core/amount.js";
import { confirmFunds } from "../core/confirm.js";
import { previewDeposit, renderPreview } from "../core/preview.js";
import { withSession } from "../core/session.js";
import { asset, dryRun, yes } from "../flags.js";
import { NetworkCommand } from "../network-command.js";
import { spinner, step } from "../ui/log.js";
import { fields } from "../ui/output.js";

export default class Deposit extends NetworkCommand {
  static summary = "deposit collateral";
  static description =
    "Sends the deposit, then waits for core to count it. If that wait " +
    "times out the deposit is reported as pending and the command still " +
    "exits 0: the money has moved, and it becomes spendable without " +
    "another deposit.";
  static args = {
    amount: Args.string({
      description: 'in whole units, such as 5 or 0.10; "5 USDC" also works',
      required: true,
    }),
  };
  static flags = {
    asset,
    gas: Flags.string({
      default: "auto",
      options: ["auto", "self"],
      summary: "auto uses a sponsored transaction when one is available",
    }),
    wait: Flags.string({
      default: "spendable",
      options: ["spendable", "mined"],
      summary: "mined returns without waiting for core to count the deposit",
    }),
    timeout: Flags.integer({
      default: 60,
      helpValue: "<seconds>",
      min: 1,
      summary: "how long to wait for core to count the deposit",
    }),
    "dry-run": dryRun,
    yes,
  };
  static examples = [
    "<%= config.bin %> <%= command.id %> 5 --asset USDC",
    '<%= config.bin %> <%= command.id %> "0.01 ETH" --network base-sepolia',
    "<%= config.bin %> <%= command.id %> 5 --asset USDC --dry-run",
    "<%= config.bin %> <%= command.id %> 5 --asset USDC --yes --json",
  ];

  async run() {
    const { args, flags } = await this.parse(Deposit);
    const settings = await this.settings(flags);
    const amount = amountInput(args.amount, settings.asset);
    const label = `${amount.amount} ${amount.asset}`;

    return withSession(settings, async (client) => {
      if (flags["dry-run"]) {
        const preview = await previewDeposit(
          settings,
          client,
          amount,
          flags.gas as "auto" | "self",
        );
        this.log(renderPreview(preview));
        return preview;
      }

      await confirmFunds(
        {
          action: `Deposit ${label}`,
          address: client.address,
          details: [
            [
              "gas",
              flags.gas === "self"
                ? "paid by this wallet"
                : "sponsored if possible",
            ],
          ],
        },
        settings,
        flags,
      );

      // Mined first, so the hash is on screen before the longer wait starts.
      const mined = await step(
        `Depositing ${label}`,
        () =>
          client.deposit(amount, {
            gas: flags.gas as "auto" | "self",
            wait: "mined",
          }),
        `Deposit of ${label} mined`,
      );
      this.note(`transaction: ${mined.explorerUrl ?? mined.txHash}`);

      let result = mined;
      if (flags.wait === "spendable") {
        const waiting = spinner("Waiting for core to count the deposit");
        result = await mined.spendable({ timeoutMs: flags.timeout * 1000 });
        if (result.status === "spendable") waiting.succeed("Spendable");
        else {
          waiting.warn(
            `Not counted after ${flags.timeout}s. The deposit is mined and ` +
              "will become spendable; do not send it again. Check with " +
              "`4mica balance`.",
          );
        }
      }

      this.log(
        fields([
          ["status", result.status],
          ["amount", `${result.amount} ${result.asset.symbol}`],
          ["transaction", result.txHash],
          ["network", result.network],
          ["explorer", result.explorerUrl],
        ]),
      );
      return result;
    });
  }
}
