import { access } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { intro, note, outro } from "@clack/prompts";
import terminalLink from "terminal-link";
import { resolveRunContext } from "../core/context.js";
import { copyTemplate } from "../core/copy-engine.js";
import { detectPackageManager } from "../core/package-manager.js";
import { gitInit, install, runScript } from "../core/runner.js";
import { resolveTemplate } from "../core/template-registry.js";
import { type PartialInit, runInitFlow } from "../prompts/flow.js";
import { brand, dim, ok, pc, step, warn } from "../ui/log.js";
import { launchDashboard } from "./dashboard.js";

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

export async function initCommand(flags: PartialInit): Promise<void> {
  intro(brand("4mica"));

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
    throw new Error(`Template not found: ${template.dir}`);
  }
  if (await exists(targetDir)) {
    throw new Error(
      `Directory already exists: ${opts.dir} — choose another name.`,
    );
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
  outro(ok("Done — happy building!"));

  // Launch the dashboard detached BEFORE the (blocking) dev server.
  if (opts.openDashboard) {
    await launchDashboard({ open: true, background: true });
  }

  if (opts.install && opts.run) {
    await runScript(opts.packageManager, template.runScript, targetDir);
  }
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
  note(lines.join("\n"), "Next steps");
}
