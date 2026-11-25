import { type Command, CommandHelp, Help } from "@oclif/core";
import { CLI_DOCS_URL, DOCS_URL } from "./core/links.js";

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
  ["SETTINGS", ["config", "autocomplete", "version"]],
];
const UNLISTED = new Set(["help"]);

/** First command lines for someone who has typed `4mica` and nothing else. */
const ROOT_EXAMPLES: [string, string][] = [
  ["init my-app --template seller-express", "scaffold a paid API"],
  ["wallets create", "make a wallet, kept in a file only you can read"],
  ["deposit 5 --asset USDC --dry-run", "see what a deposit would do"],
  ["fetch https://api.example.com/report", "request a url, paying if asked"],
];

/** The flags that work on every command, or on every one that connects. */
const COMMON_FLAGS: [string, string][] = [
  ["--json", "print the result, or the error, as JSON on stdout"],
  ["-q, --quiet", "print the result and errors only"],
  ["--no-input", "never ask a question; fail if one is needed"],
  [
    "--network <name>",
    "network to use; the default is the base-sepolia testnet",
  ],
  ["--debug", "print each request and the stack of a failure"],
  ["-h, --help", "flags and examples for a command"],
];

/**
 * Examples right after the usage line: they are what people read first.
 * The docs link last, for the longer story.
 */
class ExamplesFirst extends CommandHelp {
  protected override sections() {
    const sections = super.sections();
    const at = sections.findIndex(({ header }) => header === "EXAMPLES");
    if (at > 1) sections.splice(1, 0, ...sections.splice(at, 1));
    sections.push({
      header: "LEARN MORE",
      generate: () => `  ${CLI_DOCS_URL}`,
    });
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
    this.log(
      this.section(
        "EXAMPLES",
        list(ROOT_EXAMPLES.map(([line, what]) => [`${bin} ${line}`, what])),
      ),
    );
    this.log("");
    this.log(this.section("COMMON FLAGS", list(COMMON_FLAGS)));
    this.log("");
    const bugs = typeof pjson.bugs === "string" ? pjson.bugs : pjson.bugs?.url;
    this.log(
      this.section(
        "LEARN MORE",
        list([
          [`${bin} help <command>`, "flags and examples for one command"],
          ["docs", CLI_DOCS_URL],
          ["", DOCS_URL],
          ["issues", bugs],
        ]),
      ),
    );
    this.log("");
  }
}
