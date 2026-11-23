import { cancel, confirm, isCancel, select, text } from "@clack/prompts";
import { DOCS_URL } from "../core/links.js";
import { toPackageName } from "../core/substitute.js";
import type {
  AgentRole,
  BuildType,
  Framework,
  InitOptions,
  PackageManager,
} from "../types.js";

// stdout is kept for the command's result.
const io = { output: process.stderr };

/** Flags already supplied on the command line (any subset of InitOptions). */
export type PartialInit = Partial<InitOptions>;

function bail(): never {
  cancel("Scaffolding cancelled.", io);
  process.exit(0);
}

function unwrap<T>(value: T | symbol): T {
  if (isCancel(value)) bail();
  return value as T;
}

/**
 * Fill any missing InitOptions interactively. Every prompt is skipped when the
 * corresponding flag was already provided, so flag mode and interactive mode
 * converge on the same resolved options.
 */
export async function runInitFlow(
  flags: PartialInit,
  defaultPm: PackageManager,
): Promise<InitOptions> {
  if (flags.type === undefined) {
    const fromScratch = unwrap(
      await confirm({
        ...io,
        message: "Generate a new 4Mica project from scratch?",
        initialValue: true,
      }),
    );
    if (!fromScratch) {
      cancel(
        "No problem. In an existing app, `npm i @4mica/x402` to charge for " +
          "a route, or `npm i @4mica/sdk` to pay for one. " +
          `Docs: ${DOCS_URL}`,
        io,
      );
      process.exit(0);
    }
  }

  const type: BuildType =
    flags.type ??
    unwrap(
      await select({
        ...io,
        message: "What are you building?",
        options: [
          {
            value: "agent",
            label: "Trading agent",
            hint: "buys/sells over x402",
          },
          { value: "seller", label: "Paid API (seller)" },
          { value: "buyer", label: "Buyer client" },
        ],
      }),
    );

  let agentRole: AgentRole = flags.agentRole ?? "seller";
  // Express is the only framework the seller and buyer templates come in.
  const framework: Framework = flags.framework ?? "express";

  if (type === "agent") {
    if (flags.agentRole === undefined) {
      agentRole = unwrap(
        await select({
          ...io,
          message: "Which side does your agent play?",
          options: [
            {
              value: "seller",
              label: "Seller agent",
              hint: "earns by selling info",
            },
            {
              value: "buyer",
              label: "Buyer agent",
              hint: "spends to reach a goal",
            },
          ],
        }),
      );
    }
  }

  const defaultName =
    type === "agent" ? `my-${agentRole}-agent` : `my-${type}-${framework}`;
  const name =
    flags.name ??
    toPackageName(
      unwrap(
        await text({
          ...io,
          message: "Project name?",
          placeholder: defaultName,
          defaultValue: defaultName,
        }),
      ),
    );

  const packageManager: PackageManager =
    flags.packageManager ??
    unwrap(
      await select({
        ...io,
        message: "Install with which package manager?",
        initialValue: defaultPm,
        options: [
          { value: "pnpm", label: "pnpm" },
          { value: "npm", label: "npm" },
          { value: "yarn", label: "yarn" },
          { value: "bun", label: "bun" },
        ],
      }),
    );

  const openDashboard =
    flags.openDashboard ??
    unwrap(
      await confirm({
        ...io,
        message: "Open the 4Mica dashboard to manage agents & transactions?",
        initialValue: true,
      }),
    );

  const install = flags.install ?? true;
  const run =
    flags.run ??
    (install &&
      unwrap(
        await confirm({
          ...io,
          message: "Start it now?",
          initialValue: true,
        }),
      ));

  return {
    dir: flags.dir ?? name,
    name,
    type,
    framework,
    agentRole,
    packageManager,
    install,
    run,
    openDashboard,
  };
}
