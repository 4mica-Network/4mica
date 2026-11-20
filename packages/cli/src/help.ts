import { type Command, Help } from "@oclif/core";

/** Root help lists commands by what the user is doing, not alphabetically. */
const GROUPS: [string, string[]][] = [
  ["PROJECT", ["init", "dev", "dashboard"]],
  ["WALLET", ["whoami", "balance", "deposit", "withdraw", "withdrawals"]],
  ["NETWORK", ["networks", "tokens", "status"]],
  ["SETTINGS", ["config"]],
];

export default class GroupedHelp extends Help {
  protected override async showRootHelp(): Promise<void> {
    const commands = new Map<string, Command.Loadable>(
      this.sortedCommands
        .filter((c) => !c.id.includes(":"))
        .map((c) => [c.id, c]),
    );
    const grouped = new Set(GROUPS.flatMap(([, ids]) => ids));
    const other = [...commands.keys()].filter((id) => !grouped.has(id));
    const sections = other.length > 0 ? [...GROUPS, ["OTHER", other]] : GROUPS;

    this.log(this.formatRoot());
    this.log("");
    for (const [title, ids] of sections as [string, string[]][]) {
      const rows = ids.flatMap((id) => {
        const command = commands.get(id);
        return command ? [[id, this.summary(command)]] : [];
      });
      if (rows.length === 0) continue;
      this.log(
        this.section(
          title,
          this.renderList(rows, {
            indentation: 2,
            spacer: "\n",
            stripAnsi: this.opts.stripAnsi,
          }),
        ),
      );
      this.log("");
    }
  }
}
