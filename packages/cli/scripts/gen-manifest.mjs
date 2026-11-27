// Writes oclif.manifest.json: every command with its flags, arguments and
// help text, as data. oclif reads it in place of loading each command file
// to answer `--help`, and a script or an agent can read it in place of
// scraping help.
//
// It is built from dist/, so it is made when the package is packed
// (`prepack`) and removed afterwards (`postpack`): left in a checkout it
// goes stale the next time a command changes, and oclif would believe it.
//
//   node scripts/gen-manifest.mjs            write oclif.manifest.json
//   node scripts/gen-manifest.mjs --stdout   print it, write nothing
//   node scripts/gen-manifest.mjs --clean    remove it
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Plugin } from "@oclif/core";

const root = fileURLToPath(new URL("..", import.meta.url));
const file = join(root, "oclif.manifest.json");

if (process.argv.includes("--clean")) {
  rmSync(file, { force: true });
} else {
  const plugin = new Plugin({
    root,
    type: "core",
    isRoot: true,
    // Read the command files, not a manifest left from an earlier run, and
    // fail on a command that does not load instead of leaving it out.
    ignoreManifest: true,
    errorOnManifestCreate: true,
    respectNoCacheDefault: true,
  });
  await plugin.load();
  const manifest = `${JSON.stringify(plugin.manifest, null, 2)}\n`;
  if (process.argv.includes("--stdout")) process.stdout.write(manifest);
  else writeFileSync(file, manifest);
}
