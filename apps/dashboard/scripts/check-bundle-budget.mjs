import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const KB = 1024;
const BUDGETS = {
  startupJs: 290 * KB,
  startupCss: 25 * KB,
  lazyChunk: 60 * KB,
};

const dist = process.argv[2] ?? "dist";
const gzipSize = (file) =>
  gzipSync(readFileSync(join(dist, file)), { level: 9 }).length;
const kb = (bytes) => `${(bytes / KB).toFixed(1)} kB`;

const html = readFileSync(join(dist, "index.html"), "utf8");
const startup = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map(
  (match) => match[1],
);
const startupJs = startup.filter((file) => file.endsWith(".js"));
const startupCss = startup.filter((file) => file.endsWith(".css"));
if (startupJs.length === 0) {
  throw new Error(`No startup scripts found in ${dist}/index.html`);
}

const total = (files) => files.reduce((sum, file) => sum + gzipSize(file), 0);
const lazy = readdirSync(join(dist, "assets"))
  .map((name) => `assets/${name}`)
  .filter((file) => file.endsWith(".js") && !startupJs.includes(file))
  .map((file) => ({ file, size: gzipSize(file) }))
  .sort((a, b) => b.size - a.size);

const checks = [
  ["Startup JS", total(startupJs), BUDGETS.startupJs],
  ["Startup CSS", total(startupCss), BUDGETS.startupCss],
  [
    `Largest lazy chunk (${lazy[0]?.file ?? "none"})`,
    lazy[0]?.size ?? 0,
    BUDGETS.lazyChunk,
  ],
];

let failed = false;
for (const [label, size, budget] of checks) {
  const over = size > budget;
  failed ||= over;
  console.log(
    `${over ? "FAIL" : "ok  "} ${label}: ${kb(size)} gzip (budget ${kb(budget)})`,
  );
}

if (failed) {
  console.error(
    "Bundle budget exceeded. See apps/dashboard/scripts/check-bundle-budget.mjs.",
  );
  process.exit(1);
}
