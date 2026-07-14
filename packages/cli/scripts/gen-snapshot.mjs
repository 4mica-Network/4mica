// Generates snapshot.json: a frozen copy of the pnpm catalog + every
// @4mica/* package version, so the PUBLISHED CLI can rewrite template deps to
// real semver with no network and no monorepo present. Runs before build.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = join(here, "..");
const repoRoot = join(cliRoot, "..", "..");

/**
 * Minimal parser for the `catalog:` / `catalogs:` sections of
 * pnpm-workspace.yaml. Handles the flat map + one level of named catalogs.
 */
function parseCatalogs(yaml) {
  const lines = yaml.split("\n");
  const result = { catalog: {}, catalogs: {} };
  let mode = null; // "catalog" | "catalogs"
  let namedCatalog = null;

  for (const raw of lines) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;

    if (indent === 0) {
      mode = raw.startsWith("catalog:")
        ? "catalog"
        : raw.startsWith("catalogs:")
          ? "catalogs"
          : null;
      namedCatalog = null;
      continue;
    }
    if (!mode) continue;

    const line = raw.trim();
    const kv = line.match(/^'?([^':]+)'?:\s*(.+)$/);

    if (mode === "catalog" && kv) {
      result.catalog[kv[1]] = stripQuotes(kv[2]);
    } else if (mode === "catalogs") {
      if (indent === 2 && line.endsWith(":")) {
        namedCatalog = line.slice(0, -1);
        result.catalogs[namedCatalog] = {};
      } else if (namedCatalog && kv) {
        result.catalogs[namedCatalog][kv[1]] = stripQuotes(kv[2]);
      }
    }
  }
  return result;
}

function stripQuotes(v) {
  return v.replace(/^['"]|['"]$/g, "").trim();
}

function collectFourMicaVersions() {
  const versions = {};
  const packagesDir = join(repoRoot, "packages");
  for (const entry of readdirSync(packagesDir)) {
    const pkgPath = join(packagesDir, entry, "package.json");
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (pkg.name?.startsWith("@4mica/") && pkg.version && !pkg.private) {
        versions[pkg.name] = pkg.version;
      }
    } catch {
      // not a package dir
    }
  }
  return versions;
}

const workspaceYaml = readFileSync(
  join(repoRoot, "pnpm-workspace.yaml"),
  "utf8",
);
const { catalog, catalogs } = parseCatalogs(workspaceYaml);
const fourMica = collectFourMicaVersions();

const snapshot = { catalog, catalogs, fourMica };
writeFileSync(
  join(cliRoot, "snapshot.json"),
  `${JSON.stringify(snapshot, null, 2)}\n`,
);
console.log(
  `[gen-snapshot] catalog: ${Object.keys(catalog).length} deps, ` +
    `@4mica: ${Object.keys(fourMica).length} packages`,
);
