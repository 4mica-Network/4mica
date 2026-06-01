import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import ora from "ora";
import pc from "picocolors";
import { rimraf } from "rimraf";

const removeDirectory = async (path: string) => {
  const spinner = ora(`Removing ${path}...`).start();
  try {
    const removed = await rimraf(path);
    if (removed) {
      spinner.succeed(pc.green(`${path} folder removed.`));
    } else {
      spinner.fail(pc.red(`Could not remove every entry in ${path}.`));
    }
  } catch (error) {
    spinner.fail(pc.red(`Unexpected error removing ${path}: ${error}`));
  }
};

const findAllTargetDirs = (_dir: string, targetNames: string[]): string[] => {
  const result: string[] = [];
  const walk = (currentDir: string) => {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (targetNames.includes(entry)) {
            result.push(fullPath);
          } else {
            walk(fullPath);
          }
        }
      } catch {}
    }
  };

  walk(resolve("."));
  return result;
};

(async () => {
  const targets = ["node_modules", "dist", "coverage"];
  const allDirs = findAllTargetDirs(".", targets);

  for (const dir of allDirs) {
    await removeDirectory(dir);
  }
})();
