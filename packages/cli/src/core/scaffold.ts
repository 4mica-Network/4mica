import { access } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { intro, note, outro } from "@clack/prompts";
import { failure, usageError } from "../errors.js";
import { type PartialInit, runInitFlow } from "../prompts/flow.js";
import type { InitOptions } from "../types.js";
import { brand, ok, pc, step } from "../ui/log.js";
import { resolveRunContext } from "./context.js";
import { copyTemplate } from "./copy-engine.js";
import { fundingSteps, renderSteps, type Step } from "./next-steps.js";
import { detectPackageManager } from "./package-manager.js";
import { gitInit, install } from "./runner.js";
import { runtime } from "./runtime.js";
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
  /** What is done and what is left, down to taking the project live. */
  nextSteps: Step[];
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

export async function scaffold(
  flags: PartialInit,
  /** Whether the cli already has a wallet to offer the project. */
  hasWallet = false,
): Promise<Scaffolded | undefined> {
  if (!runtime.quiet) intro(brand("4mica"), io);

  const context = await resolveRunContext();
  const defaultPm = await detectPackageManager(
    process.cwd(),
    flags.packageManager,
  );
  const opts = await runInitFlow(flags, defaultPm);
  if (!opts) return undefined;

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
    try {
      await step(
        `Installing dependencies with ${opts.packageManager}`,
        () => install(opts.packageManager, targetDir),
        "Dependencies installed",
      );
    } catch (error) {
      // The project is there; only the install is missing. Rerunning
      // `init` would stop at DIRECTORY_EXISTS, so say how to finish.
      const tail = (error as { stderr?: string }).stderr
        ?.trim()
        .split("\n")
        .slice(-5)
        .join("\n");
      throw failure(
        `${opts.dir} was created, but its dependencies were not installed` +
          (tail ? `:\n${tail}` : ""),
        {
          code: "INSTALL_FAILED",
          suggestions: [
            `finish it with: cd ${JSON.stringify(opts.dir)} && ${opts.packageManager} install`,
          ],
        },
      );
    }
  }

  const nextSteps = stepsAfter(opts, template.runScript, hasWallet);
  if (!runtime.quiet) {
    note(renderSteps(nextSteps), "Next steps", io);
    outro(ok("Done — happy building!"), io);
  }

  return {
    dir: targetDir,
    name: opts.name,
    template: template.dir,
    packageManager: opts.packageManager,
    installed: opts.install,
    runScript: template.runScript,
    nextSteps,
    options: opts,
  };
}

/**
 * The project runs in demo mode as it is. The rest of the list is what a
 * real payment needs: a wallet, and for the side that pays, collateral.
 */
function stepsAfter(
  opts: InitOptions,
  script: string,
  hasWallet: boolean,
): Step[] {
  const { dir, packageManager: pm } = opts;
  const pays =
    opts.type === "buyer" ||
    (opts.type === "agent" && opts.agentRole === "buyer");
  return [
    { done: true, step: "project created", command: dir },
    {
      done: opts.install,
      step: opts.install ? "dependencies installed" : "install dependencies",
      command: opts.install ? undefined : `cd ${dir} && ${pm} install`,
    },
    {
      done: false,
      step: "run it in demo mode",
      command: `cd ${dir} && ${pm} run ${script}`,
    },
    {
      done: hasWallet,
      step: pays ? "wallet to pay from" : "wallet to be paid at",
      command: hasWallet ? "4mica whoami" : "4mica wallets create",
    },
    ...(pays ? fundingSteps() : []),
    {
      done: false,
      step: "take the project live",
      command: pays
        ? `set FOURMICA_WALLET_PRIVATE_KEY in ${join(dir, ".env")}`
        : `set PAY_TO in ${join(dir, ".env")}`,
    },
  ];
}
