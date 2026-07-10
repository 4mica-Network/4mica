import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { launchDashboard } from "./commands/dashboard.js";
import { devCommand } from "./commands/dev.js";
import { initCommand } from "./commands/init.js";
import type { PartialInit } from "./prompts/flow.js";
import type {
  AgentRole,
  BuildType,
  Framework,
  PackageManager,
} from "./types.js";
import { err } from "./ui/log.js";

const BUILD_TYPES: BuildType[] = ["agent", "seller", "buyer"];
const FRAMEWORKS: Framework[] = ["express", "hono", "next"];
const AGENT_ROLES: AgentRole[] = ["seller", "buyer"];
const PMS: PackageManager[] = ["pnpm", "npm", "yarn", "bun"];

/** Map yargs argv → the partial InitOptions the flow expects. */
function flagsFromArgv(argv: Record<string, unknown>): PartialInit {
  const flags: PartialInit = {};
  if (argv.dir) flags.dir = String(argv.dir);
  if (argv.name) flags.name = String(argv.name);
  if (argv.type) flags.type = argv.type as BuildType;
  if (argv.framework) flags.framework = argv.framework as Framework;
  if (argv.role) flags.agentRole = argv.role as AgentRole;
  if (argv.pm) flags.packageManager = argv.pm as PackageManager;
  if (argv.install === false) flags.install = false;
  if (argv.run === false) flags.run = false;
  if (argv.dashboard !== undefined)
    flags.openDashboard = Boolean(argv.dashboard);

  // Non-interactive mode: fill defaults so no prompt is reached.
  if (argv.yes) {
    flags.type ??= "agent";
    if (flags.type === "agent") flags.agentRole ??= "seller";
    else flags.framework ??= "express";
    flags.packageManager ??= "pnpm";
    flags.install ??= true;
    flags.run ??= false; // scriptable: don't block on a dev server
    flags.openDashboard ??= false;
    flags.name ??=
      flags.type === "agent"
        ? `my-${flags.agentRole}-agent`
        : `my-${flags.type}-${flags.framework}`;
  }
  return flags;
}

export async function run(): Promise<void> {
  const cli = yargs(hideBin(process.argv))
    .scriptName("4mica")
    .usage("$0 <command> [options]")
    .command(
      ["init [dir]", "$0 [dir]"],
      "Scaffold a new 4Mica agent or payment app",
      (y) =>
        y
          .positional("dir", { type: "string", describe: "Target directory" })
          .option("type", { choices: BUILD_TYPES, describe: "What to build" })
          .option("framework", {
            choices: FRAMEWORKS,
            describe: "Framework (seller/buyer)",
          })
          .option("role", {
            choices: AGENT_ROLES,
            describe: "Trading role (agent)",
          })
          .option("name", { type: "string", describe: "Project name" })
          .option("pm", { choices: PMS, describe: "Package manager" })
          .option("install", {
            type: "boolean",
            default: true,
            describe: "Install dependencies",
          })
          .option("run", {
            type: "boolean",
            default: true,
            describe: "Start the dev server after scaffolding",
          })
          .option("dashboard", {
            type: "boolean",
            describe: "Open the dashboard after scaffolding",
          })
          .option("yes", {
            alias: "y",
            type: "boolean",
            describe: "Accept defaults; no prompts (CI)",
          }),
      async (argv) => {
        await initCommand(flagsFromArgv(argv as Record<string, unknown>));
      },
    )
    .command(
      "dashboard",
      "Launch the 4Mica dashboard (manage agents, transactions, whitelist)",
      (y) =>
        y.option("open", {
          type: "boolean",
          default: true,
          describe: "Open a browser",
        }),
      async (argv) => {
        await launchDashboard({ open: Boolean(argv.open) });
      },
    )
    .command(
      "dev",
      "Run the current project's dev server",
      (y) => y,
      async () => {
        await devCommand();
      },
    )
    .demandCommand(0)
    .strict()
    .help()
    .alias("help", "h")
    .version()
    .alias("version", "v")
    .fail((msg, error) => {
      process.stderr.write(err(`\n${msg || error?.message || "Error"}\n`));
      process.exit(1);
    });

  await cli.parse();
}
