import { existsSync } from "node:fs";
import { join } from "node:path";
import { BaseCommand } from "../base.js";
import { detectPackageManager } from "../core/package-manager.js";
import { runScript } from "../core/runner.js";
import { usageError } from "../errors.js";

export default class Dev extends BaseCommand {
  static summary = "run the current project's dev server";
  static description =
    "Runs the `dev` script with the package manager the project uses.";
  static enableJsonFlag = false;
  static examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    await this.parse(Dev);
    const cwd = process.cwd();
    if (!existsSync(join(cwd, "package.json"))) {
      throw usageError("there is no project here: no package.json", {
        code: "NO_PROJECT",
        suggestions: [
          "run it inside a project, or scaffold one with `4mica init`",
        ],
      });
    }
    await runScript(await detectPackageManager(cwd), "dev", cwd);
  }
}
