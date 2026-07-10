import { cancel, confirm, isCancel, select, text } from "@clack/prompts";
import { toPackageName } from "../core/substitute.js";
import type {
  AgentRole,
  BuildType,
  Framework,
  InitOptions,
  PackageManager,
} from "../types.js";

/** Flags already supplied on the command line (any subset of InitOptions). */
export type PartialInit = Partial<InitOptions>;

function bail(): never {
  cancel("Scaffolding cancelled.");
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
        message: "Generate a new 4Mica project from scratch?",
        initialValue: true,
      }),
    );
    if (!fromScratch) {
      cancel(
        "No problem — add 4Mica to an existing app with " +
          "`npm i @4mica/sdk @4mica/sdk-node`, then wrap a route with a " +
          "paywall. Docs: https://4mica.io/docs",
      );
      process.exit(0);
    }
  }

  const type: BuildType =
    flags.type ??
    unwrap(
      await select({
        message: "What are you building?",
        options: [
          {
            value: "agent",
            label: "Trading agent",
            hint: "buys/sells over x402",
          },
          { value: "seller", label: "Paywalled API (seller)" },
          { value: "buyer", label: "Buyer client" },
        ],
      }),
    );

  let agentRole: AgentRole = flags.agentRole ?? "seller";
  let framework: Framework = flags.framework ?? "express";

  if (type === "agent") {
    if (flags.agentRole === undefined) {
      agentRole = unwrap(
        await select({
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
  } else if (flags.framework === undefined) {
    framework = unwrap(
      await select({
        message: "Which framework?",
        options: [
          { value: "express", label: "Express" },
          { value: "hono", label: "Hono" },
          { value: "next", label: "Next.js" },
        ],
      }),
    );
  }

  const defaultName =
    type === "agent" ? `my-${agentRole}-agent` : `my-${type}-${framework}`;
  const name =
    flags.name ??
    toPackageName(
      unwrap(
        await text({
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
        message: "Open the 4Mica dashboard to manage agents & transactions?",
        initialValue: true,
      }),
    );

  return {
    dir: flags.dir ?? name,
    name,
    type,
    framework,
    agentRole,
    packageManager,
    install: flags.install ?? true,
    run: flags.run ?? true,
    openDashboard,
  };
}
