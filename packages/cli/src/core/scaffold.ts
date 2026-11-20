import { access } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { intro, note, outro } from "@clack/prompts";
import terminalLink from "terminal-link";
import { failure, usageError } from "../errors.js";
import { type PartialInit, runInitFlow } from "../prompts/flow.js";
import type { InitOptions } from "../types.js";
import { brand, dim, ok, pc, step, warn } from "../ui/log.js";
import { resolveRunContext } from "./context.js";
import { copyTemplate } from "./copy-engine.js";
import { detectPackageManager } from "./package-manager.js";
import { gitInit, install } from "./runner.js";
import { resolveTemplate } from "./template-registry.js";

// stdout is kept for the command's result.
const io = { output: process.stderr };

export interface Scaffolded {
  /** Absolute path of the new project. */
  dir: string;
  name: string;
  template: string;
  packageManager: string;
  installed: boolean;
  /** package.json script that starts the project. */
  runScript: string;
  options: InitOptions;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return !rel.startsWith("..") && !isAbsolute(rel);
}

export async function scaffold(flags: PartialInit): Promise<Scaffolded> {
  intro(brand("4mica"), io);

  const context = await resolveRunContext();
  const defaultPm = await detectPackageManager(
    process.cwd(),
    flags.packageManager,
  );
  const opts = await runInitFlow(flags, defaultPm);

  const template = resolveTemplate(opts);
  const templateDir = join(context.templatesDir, template.dir);
  const targetDir = resolve(process.cwd(), opts.dir);

  if (!(await exists(templateDir))) {
    throw failure(`template not found: ${template.dir}`, {
      code: "TEMPLATE_NOT_FOUND",
    });
  }
  if (await exists(targetDir)) {
    throw usageError(`directory already exists: ${opts.dir}`, {
      code: "DIRECTORY_EXISTS",
      suggestions: ["choose another name or directory"],
    });
  }

  const keepWorkspace =
    context.inMonorepo &&
    context.monorepoRoot !== undefined &&
    isInside(targetDir, context.monorepoRoot);

  await step(`Scaffolding ${pc.bold(opts.name)}`, () =>
    copyTemplate({
      templateDir,
      targetDir,
      tokens: {
        PROJECT_NAME: opts.name,
        DESCRIPTION: template.description,
        PORT: String(template.port),
        TMPFILE: template.tmpfile,
      },
      keepWorkspace,
    }),
  );

  await gitInit(targetDir);

  if (opts.install) {
    await step(
      `Installing dependencies with ${opts.packageManager}`,
      () => install(opts.packageManager, targetDir),
      "Dependencies installed",
    );
  }

  printNextSteps(opts, template.runScript);
  outro(ok("Done — happy building!"), io);

  return {
    dir: targetDir,
    name: opts.name,
    template: template.dir,
    packageManager: opts.packageManager,
    installed: opts.install,
    runScript: template.runScript,
    options: opts,
  };
}

function printNextSteps(
  opts: { dir: string; packageManager: string; install: boolean },
  script: string,
): void {
  const docs = terminalLink("4mica.io/docs", "https://4mica.io/docs");
  const lines = [`cd ${opts.dir}`];
  if (!opts.install) lines.push(`${opts.packageManager} install`);
  lines.push(`${opts.packageManager} run ${script}`);
  lines.push("");
  lines.push(`${dim("Demo mode needs no config. Going live?")} ${docs}`);
  lines.push(`${dim("Env template:")} ${warn(join(opts.dir, ".env.example"))}`);
  note(lines.join("\n"), "Next steps", io);
}
