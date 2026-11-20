import { Args, Command, loadHelpClass } from "@oclif/core";

export default class HelpCommand extends Command {
  static summary = "show help for a command";
  static args = {
    command: Args.string({ description: "the command, such as deposit" }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> deposit",
    "<%= config.bin %> <%= command.id %> withdrawals request",
  ];
  // A command is one or two words: `help withdrawals request`.
  static strict = false;

  async run(): Promise<void> {
    const { argv } = await this.parse(HelpCommand);
    const Help = await loadHelpClass(this.config);
    await new Help(
      this.config,
      this.config.pjson.oclif.helpOptions ?? {},
    ).showHelp(argv as string[]);
  }
}
