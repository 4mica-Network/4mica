import { type Command, CommandHelp, Help } from "@oclif/core";

/** Root help lists commands by what the user is doing, not alphabetically. */
const GROUPS: [string, string[]][] = [
  ["PROJECT", ["init", "dev", "dashboard"]],
  [
    "WALLET",
    ["wallets", "whoami", "balance", "deposit", "withdraw", "withdrawals"],
  ],
  ["PAY", ["fetch", "cycles"]],
  ["SELL", ["payments", "guarantees"]],
  ["NETWORK", ["networks", "tokens", "status"]],
  ["SETTINGS", ["config"]],
];
const UNLISTED = new Set(["help"]);

const DOCS_URL = "https://docs.4mica.io";

/** Examples right after the usage line: they are what people read first. */
class ExamplesFirst extends CommandHelp {
  protected override sections() {
    const sections = super.sections();
    const at = sections.findIndex(({ header }) => header === "EXAMPLES");
    if (at > 1) sections.splice(1, 0, ...sections.splice(at, 1));
    return sections;
  }
}

export default class GroupedHelp extends Help {
  protected override CommandHelpClass = ExamplesFirst;

  protected override async showRootHelp(): Promise<void> {
    const commands = new Map<string, Command.Loadable>(
      this.sortedCommands
        .filter((c) => !c.id.includes(":") && !UNLISTED.has(c.id))
        .map((c) => [c.id, c]),
    );
    const grouped = new Set(GROUPS.flatMap(([, ids]) => ids));
    const other = [...commands.keys()].filter((id) => !grouped.has(id));
    const sections: [string, string[]][] =
      other.length > 0 ? [...GROUPS, ["OTHER", other]] : GROUPS;
    const list = (rows: (string | undefined)[][]) =>
      this.renderList(rows, {
        indentation: 2,
        spacer: "\n",
        stripAnsi: this.opts.stripAnsi,
      });

    this.log(this.formatRoot());
    this.log("");
    for (const [title, ids] of sections) {
      const rows = ids.flatMap((id) => {
        const command = commands.get(id);
        if (command) return [[id, this.summary(command)]];
        // A topic with no command of its own, such as `guarantees`.
        const topic = this.sortedTopics.find((t) => t.name === id);
        return topic ? [[id, topic.description]] : [];
      });
      if (rows.length === 0) continue;
      this.log(this.section(title, list(rows)));
      this.log("");
    }

    const { bin, pjson } = this.config;
    const bugs = typeof pjson.bugs === "string" ? pjson.bugs : pjson.bugs?.url;
    this.log(
      this.section(
        "LEARN MORE",
        list([
          [`${bin} help <command>`, "flags and examples for one command"],
          ["docs", DOCS_URL],
          ["issues", bugs],
        ]),
      ),
    );
    this.log("");
  }
}
