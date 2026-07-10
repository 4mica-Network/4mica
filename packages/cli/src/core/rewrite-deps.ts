import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface Snapshot {
  catalog: Record<string, string>;
  catalogs: Record<string, Record<string, string>>;
  fourMica: Record<string, string>;
}

let cache: Snapshot | null = null;

async function loadSnapshot(): Promise<Snapshot> {
  if (cache) return cache;
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/index.js → package root holds snapshot.json (shipped in "files").
  const path = join(here, "..", "snapshot.json");
  try {
    cache = JSON.parse(await readFile(path, "utf8")) as Snapshot;
  } catch {
    cache = { catalog: {}, catalogs: {}, fourMica: {} };
  }
  return cache;
}

function resolveCatalog(snap: Snapshot, spec: string, name: string): string {
  // "catalog:" → default catalog; "catalog:node24" → named catalog.
  const named = spec.slice("catalog:".length).trim();
  const table = named ? (snap.catalogs[named] ?? {}) : snap.catalog;
  return table[name] ?? "latest";
}

function resolveWorkspace(snap: Snapshot, name: string): string {
  const version = snap.fourMica[name];
  return version ? `^${version}` : "latest";
}

function rewriteBlock(
  block: Record<string, string> | undefined,
  snap: Snapshot,
  keepWorkspace: boolean,
): void {
  if (!block) return;
  for (const [name, spec] of Object.entries(block)) {
    if (spec.startsWith("workspace:")) {
      block[name] = keepWorkspace ? spec : resolveWorkspace(snap, name);
    } else if (spec.startsWith("catalog:")) {
      block[name] = resolveCatalog(snap, spec, name);
    }
  }
}

/**
 * Rewrite a scaffolded package.json in place: `catalog:` → pinned version,
 * `workspace:*` → published `@4mica/*` semver (unless keepWorkspace, i.e. an
 * in-repo dev scaffold that should link the local packages). Also drops
 * `private` and stamps a fresh version.
 */
export async function rewritePackageJson(
  pkg: Record<string, unknown>,
  opts: { keepWorkspace: boolean },
): Promise<Record<string, unknown>> {
  const snap = await loadSnapshot();
  rewriteBlock(
    pkg.dependencies as Record<string, string> | undefined,
    snap,
    opts.keepWorkspace,
  );
  rewriteBlock(
    pkg.devDependencies as Record<string, string> | undefined,
    snap,
    opts.keepWorkspace,
  );
  if (!opts.keepWorkspace) {
    pkg.private = undefined;
  }
  return pkg;
}
