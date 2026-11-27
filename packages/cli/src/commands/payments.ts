import { Flags } from "@oclif/core";
import { withSession } from "../core/session.js";
import { networkName } from "../core/settings.js";
import { NetworkCommand } from "../network-command.js";
import { table } from "../ui/output.js";

export default class Payments extends NetworkCommand {
  static summary = "list payments guaranteed to this wallet";
  static description =
    "What this wallet has been paid, as a seller. Amounts are in the " +
    "asset's base units: core's list does not say which asset each is in.";
  static flags = {
    state: Flags.string({
      options: ["pending", "verified", "finalized", "failed"],
      summary: "only payments in this state",
    }),
    limit: Flags.integer({
      min: 1,
      helpValue: "<n>",
      summary: "the newest n payments only",
    }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --state finalized --limit 20 --json",
  ];

  async run() {
    const { flags } = await this.parse(Payments);
    const settings = await this.settings(flags);
    return withSession(settings, async (client) => {
      const { payment } = await client.lowLevel();
      const received = (await payment.listReceived())
        .map((p) => ({
          from: p.userAddress,
          amountRaw: p.amount,
          state: p.failed
            ? "failed"
            : p.finalized
              ? "finalized"
              : p.verified
                ? "verified"
                : "pending",
          // Core stamps these in milliseconds, unlike its other times.
          createdAt: new Date(p.createdAt),
          txHash: p.txHash,
        }))
        .filter((p) => !flags.state || p.state === flags.state)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, flags.limit);
      this.note(`network: ${networkName(settings)}`);
      this.log(
        table(
          ["FROM", "BASE UNITS", "STATE", "CREATED", "TRANSACTION"],
          received.map((p) => [
            p.from,
            p.amountRaw.toString(),
            p.state,
            p.createdAt.toISOString(),
            p.txHash || "-",
          ]),
        ),
      );
      if (received.length === 0) this.note("no payments received yet");
      return received;
    });
  }
}
