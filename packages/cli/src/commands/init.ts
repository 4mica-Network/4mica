import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../base.js";
import { readConfig } from "../core/config-file.js";
import { DASHBOARD_URL } from "../core/links.js";
import { openBrowser, runScript } from "../core/runner.js";
import { canPrompt } from "../core/runtime.js";
import { scaffold } from "../core/scaffold.js";
import { usageError } from "../errors.js";
import type { PartialInit } from "../prompts/flow.js";
import type {
  AgentRole,
  BuildType,
  Framework,
  PackageManager,
} from "../types.js";

/** Template id → what the scaffolder calls it. */
export const TEMPLATES: Record<string, PartialInit> = {
  "agent-seller-express": { type: "agent", agentRole: "seller" },
  "agent-buyer-node": { type: "agent", agentRole: "buyer" },
  "seller-express": { type: "seller", framework: "express" },
  "buyer-express": { type: "buyer", framework: "express" },
};
const DEFAULT_TEMPLATE = "agent-seller-express";

const replaced = { deprecated: { to: "template" }, hidden: true };

export default class Init extends BaseCommand {
  static summary = "scaffold a new agent or payment app";
  static description =
    "Asks for whatever is not given as a flag. Without a terminal it never " +
    "asks: --template is then required, everything else takes its default, " +
    "and the project is started only with --run. Projects run in demo mode " +
    "and need no credentials. It creates no wallet and sends nothing: it " +
    "ends by listing what a real payment still needs.";
  static args = {
    dir: Args.string({ description: "target directory; defaults to the name" }),
  };
  static flags = {
    template: Flags.string({
      char: "t",
      exclusive: ["type", "role", "framework"],
      options: Object.keys(TEMPLATES),
      summary: "what to scaffold",
    }),
    name: Flags.string({ summary: "project name" }),
    pm: Flags.string({
      options: ["pnpm", "npm", "yarn", "bun"],
      summary: "package manager to install with",
    }),
    install: Flags.boolean({
      allowNo: true,
      default: true,
      summary: "install dependencies",
    }),
    run: Flags.boolean({
      allowNo: true,
      exclusive: ["json"],
      summary: "start the project once it is scaffolded; asked when not given",
    }),
    dashboard: Flags.boolean({
      allowNo: true,
      summary: "open the dashboard afterwards",
    }),
    yes: Flags.boolean({
      char: "y",
      summary: "accept the defaults without asking",
    }),
    type: Flags.string({ ...replaced, options: ["agent", "seller", "buyer"] }),
    role: Flags.string({ ...replaced, options: ["seller", "buyer"] }),
    framework: Flags.string({ ...replaced, options: ["express"] }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> my-api --template seller-express --pm pnpm",
    "<%= config.bin %> <%= command.id %> --template agent-buyer-node --yes --json",
  ];

  async run() {
    const { args, flags } = await this.parse(Init);

    const init: PartialInit = flags.template
      ? { ...TEMPLATES[flags.template] }
      : {};
    if (flags.type) init.type = flags.type as BuildType;
    if (flags.role) init.agentRole = flags.role as AgentRole;
    if (flags.framework) init.framework = flags.framework as Framework;
    if (args.dir) init.dir = args.dir;
    if (flags.name) init.name = flags.name;
    if (flags.pm) init.packageManager = flags.pm as PackageManager;
    init.install = flags.install;
    if (flags.run !== undefined) init.run = flags.run;
    if (flags.dashboard !== undefined) init.openDashboard = flags.dashboard;

    const canAsk = canPrompt() && !flags.yes && !this.jsonEnabled();
    if (!canAsk) {
      if (!init.type && !flags.yes) {
        throw usageError("nothing to ask with: --template is required here", {
          code: "TEMPLATE_REQUIRED",
          suggestions: [
            `pass --template, one of: ${Object.keys(TEMPLATES).join(", ")}`,
            `or --yes to scaffold ${DEFAULT_TEMPLATE}`,
          ],
        });
      }
      const filled = { ...TEMPLATES[DEFAULT_TEMPLATE], ...init };
      filled.agentRole ??= "seller";
      filled.framework ??= "express";
      filled.packageManager ??= "pnpm";
      filled.openDashboard ??= false;
      filled.run ??= false;
      filled.name ??=
        filled.type === "agent"
          ? `my-${filled.agentRole}-agent`
          : `my-${filled.type}-${filled.framework}`;
      Object.assign(init, filled);
    }

    const { "key-file": keyFile } = await readConfig(this.config.configDir);
    const project = await scaffold(init, Boolean(keyFile));

    // Before the dev server, which blocks.
    if (project.options.openDashboard) await openBrowser(DASHBOARD_URL);
    if (project.installed && project.options.run) {
      await runScript(
        project.options.packageManager,
        project.runScript,
        project.dir,
      );
    }

    const { options: _, ...result } = project;
    return result;
  }
}
