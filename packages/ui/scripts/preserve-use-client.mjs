// Re-adds the `"use client"` directive to built output files that reference
// client-only React APIs.
//
// Why this is needed: `@4mica/ui` ships a bundled barrel (`dist/index.js`) built
// with tsup/esbuild. esbuild strips module-level `"use client"` directives when it
// bundles and code-splits, so the emitted chunks lose the directive even if the
// source has it. When a React Server Component (e.g. apps/web's pricing page)
// imports the barrel, Next.js then errors because a client-only API (useState,
// useEffect, createPortal, …) is reachable from a server module.
//
// tsup is configured with `splitting: true`, so client component code (Tooltip,
// Dropdown) lands in its own chunk, separate from the server-safe `cn`, `Button`,
// and `Link`. This script marks only the chunks that actually import a client-only
// API, leaving the barrel and server-safe exports untouched.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIST = path.resolve(import.meta.dirname, "../dist");
const DIRECTIVE = '"use client";';

// A React hook (any `use*` identifier) or any `react-dom` import means the module
// can only run on the client. Matches both ESM (`from "react"`) and CJS
// (`require("react")`) output.
const IMPORTS_REACT =
  /(?:from\s*["']react["'])|(?:require\(\s*["']react["']\s*\))/;
const IMPORTS_REACT_DOM =
  /(?:from\s*["']react-dom["'])|(?:require\(\s*["']react-dom["']\s*\))/;
const HOOK_IDENTIFIER = /\buse[A-Z]\w*/;

async function* jsFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* jsFiles(full);
    } else if (/\.(js|cjs|mjs)$/.test(entry.name)) {
      yield full;
    }
  }
}

function needsDirective(code) {
  if (IMPORTS_REACT_DOM.test(code)) return true;
  // A React import plus any `use*` hook reference means client-only.
  return IMPORTS_REACT.test(code) && HOOK_IDENTIFIER.test(code);
}

let marked = 0;
for await (const file of jsFiles(DIST)) {
  const code = await readFile(file, "utf8");
  if (code.startsWith(DIRECTIVE)) continue;
  if (!needsDirective(code)) continue;
  await writeFile(file, `${DIRECTIVE}\n${code}`);
  marked += 1;
  console.log(`  + use client → ${path.relative(DIST, file)}`);
}

console.log(`preserve-use-client: marked ${marked} file(s)`);
