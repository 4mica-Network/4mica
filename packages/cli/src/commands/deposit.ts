import { Args, Flags } from "@oclif/core";
import { amountInput } from "../core/amount.js";
import { confirmFunds } from "../core/confirm.js";
import { MAX_TIMEOUT_SECS } from "../core/net.js";
import { beginSending, sentTransactions } from "../core/outcome.js";
import { previewDeposit } from "../core/preview.js";
import { withSession } from "../core/session.js";
import { asset, dryRun, gas, yes } from "../flags.js";
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
    gas,
    wait: Flags.string({
      default: "spendable",
      options: ["spendable", "mined"],
      summary: "mined returns without waiting for core to count the deposit",
    }),
    timeout: Flags.integer({
      default: 60,
      helpValue: "<seconds>",
      max: MAX_TIMEOUT_SECS,
      min: 1,
      summary:
        "how long to wait for core to count the deposit, after the 60s the chain may take to mine it",
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
      // The same checks with or without --dry-run: the confirmation shows
      // what the dry run would, and nothing is asked for that would fail.
      const preview = await previewDeposit(settings, client, amount, flags.gas);
      if (flags["dry-run"]) {
        this.showPreview(preview);
        return preview;
      }

      await confirmFunds(preview, settings, flags);
      beginSending(`the deposit of ${label}`, ["4mica balance"]);

      // Mined first, so the hash is on screen before the longer wait starts.
      const mined = await step(
        `Depositing ${label}`,
        () => client.deposit(amount, { gas: flags.gas, wait: "mined" }),
        `Deposit of ${label} mined`,
      );
      // A transaction the wallet sent itself was printed when it left.
      if (!sentTransactions().includes(mined.txHash)) {
        this.note(`transaction: ${mined.explorerUrl ?? mined.txHash}`);
      }

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
