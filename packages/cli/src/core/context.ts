import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findUp } from "find-up";

export interface RunContext {
  /** True when running inside the 4Mica monorepo (dev), false when published. */
  inMonorepo: boolean;
  /** Absolute path to the monorepo root, when inMonorepo. */
  monorepoRoot?: string;
  /** Absolute path to the bundled templates directory. */
  templatesDir: string;
}

/** dist/index.js → packages/cli → templates live one level up from dist/. */
function bundledTemplatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "templates");
}

/**
 * Detect whether we are running from the monorepo checkout (so scaffolds can
 * link workspace packages) or from a published install (standalone output).
 */
export async function resolveRunContext(
  cwd = process.cwd(),
): Promise<RunContext> {
  const workspaceFile = await findUp("pnpm-workspace.yaml", { cwd });
  if (workspaceFile) {
    const root = dirname(workspaceFile);
    try {
      const pkg = JSON.parse(
        await readFile(join(root, "package.json"), "utf8"),
      ) as { name?: string };
      if (pkg.name === "4mica") {
        return {
          inMonorepo: true,
          monorepoRoot: root,
          templatesDir: bundledTemplatesDir(),
        };
      }
    } catch {
      // fall through to published mode
    }
  }
  return { inMonorepo: false, templatesDir: bundledTemplatesDir() };
}
