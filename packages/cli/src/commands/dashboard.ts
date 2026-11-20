import { Flags } from "@oclif/core";
import { BaseCommand } from "../base.js";
import { resolveRunContext } from "../core/context.js";
import { DASHBOARD_URL, runLocalDashboard } from "../core/dashboard.js";
import { openBrowser } from "../core/runner.js";

export default class Dashboard extends BaseCommand {
  static summary = "open the 4mica dashboard";
  static description =
    "Opens the hosted dashboard and prints its address. With --local it " +
    "starts the dashboard's dev server instead, which needs a checkout of " +
    "the 4mica monorepo.";
  static flags = {
    local: Flags.boolean({
      exclusive: ["json"],
      summary: "run the dashboard from the monorepo",
    }),
    open: Flags.boolean({
      allowNo: true,
      default: true,
      summary: "open it in a browser",
    }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --no-open",
    "<%= config.bin %> <%= command.id %> --local",
  ];

  async run() {
    const { flags } = await this.parse(Dashboard);
    if (flags.local) {
      await runLocalDashboard({ open: flags.open });
      return;
    }
    // This command used to start the dev server whenever it ran inside the
    // monorepo; say where that went.
    if ((await resolveRunContext()).inMonorepo) {
      this.note(
        "`dashboard` now opens the hosted dashboard; the dev server of this " +
          "checkout is `dashboard --local`",
      );
    }
    if (flags.open) await openBrowser(DASHBOARD_URL);
    this.log(DASHBOARD_URL);
    return { url: DASHBOARD_URL };
  }
}
