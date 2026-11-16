import { readFileSync } from "node:fs";

const [scanPath, closurePath] = process.argv.slice(2);
if (!scanPath || !closurePath) {
  throw new Error(
    "Usage: dependency-gate.mjs <osv-scan.json> <pnpm-list.json>",
  );
}

const THRESHOLD = Number(process.env.SEVERITY_THRESHOLD ?? "7.0");

const closure = new Set();
const walk = (dependencies) => {
  for (const [name, info] of Object.entries(dependencies ?? {})) {
    closure.add(`${name}@${info.version}`);
    walk(info.dependencies);
    walk(info.optionalDependencies);
  }
};
for (const project of JSON.parse(readFileSync(closurePath, "utf8"))) {
  walk(project.dependencies);
  walk(project.optionalDependencies);
}
if (closure.size === 0) {
  throw new Error("The production dependency closure is empty.");
}

const scan = JSON.parse(readFileSync(scanPath, "utf8"));
const blocking = [];
let belowThreshold = 0;

for (const result of scan.results ?? []) {
  for (const entry of result.packages ?? []) {
    const id = `${entry.package.name}@${entry.package.version}`;
    if (!closure.has(id)) {
      continue;
    }
    for (const group of entry.groups ?? []) {
      const score = Number.parseFloat(group.max_severity);
      if (Number.isNaN(score) || score >= THRESHOLD) {
        blocking.push({
          id,
          advisory: group.ids[0],
          score: Number.isNaN(score) ? "unknown" : group.max_severity,
        });
      } else {
        belowThreshold += 1;
      }
    }
  }
}

console.log(
  `Checked ${closure.size} production packages: ${blocking.length} blocking, ${belowThreshold} below CVSS ${THRESHOLD}.`,
);

if (blocking.length > 0) {
  for (const { id, advisory, score } of blocking) {
    console.error(`::error::${id} ${advisory} (CVSS ${score})`);
  }
  process.exit(1);
}
