import { existsSync } from "node:fs";
import { join } from "node:path";
import ora from "ora";
import pc from "picocolors";
import { rimraf } from "rimraf";

const removeRootNodeModules = async () => {
  const rootPath = join(process.cwd(), "node_modules");

  if (!existsSync(rootPath)) {
    console.log(pc.yellow("No root node_modules directory found."));
    return;
  }

  const spinner = ora(`Removing root node_modules...`).start();
  try {
    const removed = await rimraf(rootPath);
    if (removed) {
      spinner.succeed(pc.green(`✅ Root node_modules removed.`));
    } else {
      spinner.fail(
        pc.red("Could not remove every entry in root node_modules."),
      );
    }
  } catch (err) {
    spinner.fail(pc.red(`Unexpected error: ${(err as Error).message}`));
  }
};

removeRootNodeModules();
