import { BaseCommand } from "../base.js";

export default class Version extends BaseCommand {
  static summary =
    "show the cli's version, and the Node and platform it runs on";
  static description =
    "The same as `4mica --version`, as a command, and with --json. Put it " +
    "in a bug report.";
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --json",
  ];

  async run() {
    await this.parse(Version);
    const { version, platform, arch } = this.config;
    this.log(this.config.userAgent);
    return { version, node: process.version, platform, arch };
  }
}
