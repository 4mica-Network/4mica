import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { rewritePackageJson } from "./rewrite-deps.js";
import { substitute, type Tokens } from "./substitute.js";

const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".turbo", ".git"]);

/** Extensions treated as text for token substitution. Others copy verbatim. */
const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".html",
  ".svg",
  ".txt",
  ".yaml",
  ".yml",
  "",
]);

/** Templates ship dotfiles under an underscore so npm keeps them in the tarball. */
function targetName(name: string): string {
  if (name === "_gitignore") return ".gitignore";
  if (name === "_npmrc") return ".npmrc";
  return name;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot);
}

export interface CopyOptions {
  templateDir: string;
  targetDir: string;
  tokens: Tokens;
  keepWorkspace: boolean;
}

/** Recursively scaffold templateDir → targetDir, substituting tokens. */
export async function copyTemplate(opts: CopyOptions): Promise<void> {
  await walk(opts.templateDir, opts);
}

async function walk(dir: string, opts: CopyOptions): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(join(dir, entry.name), opts);
      continue;
    }
    await copyFile(join(dir, entry.name), opts);
  }
}

async function copyFile(srcPath: string, opts: CopyOptions): Promise<void> {
  const rel = relative(opts.templateDir, srcPath);
  const parts = rel.split("/");
  parts[parts.length - 1] = targetName(parts[parts.length - 1]);
  const destPath = join(opts.targetDir, ...parts);
  await mkdir(join(destPath, ".."), { recursive: true });

  const base = parts[parts.length - 1];

  if (base === "package.json") {
    await writePackageJson(srcPath, destPath, opts);
    return;
  }

  if (TEXT_EXT.has(extOf(base))) {
    const body = await readFile(srcPath, "utf8");
    await writeFile(destPath, substitute(body, opts.tokens));
    return;
  }

  const raw = await readFile(srcPath);
  await writeFile(destPath, raw);
}

async function writePackageJson(
  srcPath: string,
  destPath: string,
  opts: CopyOptions,
): Promise<void> {
  const body = substitute(await readFile(srcPath, "utf8"), opts.tokens);
  const pkg = JSON.parse(body) as Record<string, unknown>;
  const rewritten = await rewritePackageJson(pkg, {
    keepWorkspace: opts.keepWorkspace,
  });
  // JSON.stringify drops keys set to undefined (e.g. private).
  await writeFile(destPath, `${JSON.stringify(rewritten, null, 2)}\n`);
}
