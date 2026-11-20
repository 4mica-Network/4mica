import { withSession } from "../../core/session.js";
import { NetworkCommand } from "../../network-command.js";
import { table } from "../../ui/output.js";

export default class Withdrawals extends NetworkCommand {
  static summary = "list pending withdrawals and when each can be finalized";
  static description =
    "A withdrawal is requested first and paid out by `withdrawals finalize` " +
    "once its grace period has passed.";
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> request 5 --asset USDC",
    "<%= config.bin %> <%= command.id %> finalize --asset USDC",
  ];

  async run() {
    const { flags } = await this.parse(Withdrawals);
    const settings = await this.settings(flags);
    return withSession(settings, async (client) => {
      const pending = await client.withdrawals();
      this.log(
        table(
          ["ASSET", "AMOUNT", "REQUESTED", "READY-AT", "STATE"],
          pending.map((w) => [
            w.asset.symbol,
            w.amount,
            w.requestedAt.toISOString(),
            w.readyAt.toISOString(),
            w.ready ? "ready" : "waiting",
          ]),
        ),
      );
      if (pending.length === 0) this.note("no pending withdrawals");
      return pending;
    });
  }
}
