import { listAssets, resolveAsset } from "../../core/assets.js";
import { withSession } from "../../core/session.js";
import { asset } from "../../flags.js";
import { NetworkCommand } from "../../network-command.js";
import { table } from "../../ui/output.js";

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

export default class Cycles extends NetworkCommand {
  static summary = "show the open settlement cycle for each asset";
  static description =
    "Payments are netted per asset and per cycle. When a cycle closes, " +
    "whoever owes pays once with `cycles pay` and whoever is owed collects " +
    "with `cycles claim`. UNCONFIRMED counts this wallet's payments since " +
    "its last checkpoint; core asks for a checkpoint when it reaches the " +
    "limit shown.";
  static flags = { asset };
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --asset USDC --json",
    "<%= config.bin %> <%= command.id %> checkpoint --asset USDC",
  ];

  async run() {
    const { flags } = await this.parse(Cycles);
    const settings = await this.settings(flags);
    return withSession(settings, async (client) => {
      const { payment } = await client.lowLevel();
      const assets = flags.asset
        ? [await resolveAsset(settings, client, flags.asset)]
        : await listAssets(settings, client);
      const cycles = await Promise.all(
        assets.map(async (token) => {
          const [cycle, batch] = await Promise.all([
            payment.activeCycle(token.address),
            payment.checkpointBatch(token.address),
          ]);
          return {
            asset: token.symbol,
            assetAddress: token.address,
            cycle: cycle.cycleIdText,
            cycleId: cycle.cycleId,
            periodStart: iso(cycle.periodStart),
            periodEnd: iso(cycle.periodEnd),
            unconfirmed: batch.authorizations.length,
            unconfirmedLimit: batch.maxUncheckpointed,
          };
        }),
      );
      this.log(
        table(
          ["ASSET", "CYCLE", "OPENED", "CLOSES", "UNCONFIRMED"],
          cycles.map((c) => [
            c.asset,
            c.cycle,
            c.periodStart,
            c.periodEnd,
            c.unconfirmedLimit
              ? `${c.unconfirmed} of ${c.unconfirmedLimit}`
              : String(c.unconfirmed),
          ]),
        ),
      );
      return cycles;
    });
  }
}
