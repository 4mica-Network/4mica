import { BaseCommand } from "../base.js";
import { detectPackageManager } from "../core/package-manager.js";
import { runScript } from "../core/runner.js";

export default class Dev extends BaseCommand {
  static summary = "run the current project's dev server";
  static description =
    "Runs the `dev` script with the package manager the project uses.";
  static enableJsonFlag = false;
  static examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    await this.parse(Dev);
    const cwd = process.cwd();
    await runScript(await detectPackageManager(cwd), "dev", cwd);
  }
}
