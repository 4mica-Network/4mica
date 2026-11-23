import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const TOP = Number(process.env.TOP ?? "25");

const decodeSegment = (segment) => {
  const values = [];
  let shift = 0;
  let value = 0;
  for (const char of segment) {
    const digit = BASE64.indexOf(char);
    value |= (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      values.push(value & 1 ? -(value >> 1) : value >> 1);
      shift = 0;
      value = 0;
    }
  }
  return values;
};

const ownerOf = (source) => {
  const dependency = source.match(
    /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/,
  );
  if (dependency) {
    return dependency[1];
  }
  const workspace = source.match(/packages\/([^/]+)\//);
  if (workspace) {
    return `@4mica/${workspace[1]}`;
  }
  const app = source.split("src/")[1];
  return app ? `app:${app.split("/").slice(0, 2).join("/")}` : source;
};

const attribute = (dir) => {
  const totals = new Map();
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".map"))) {
    const map = JSON.parse(readFileSync(join(dir, name), "utf8"));
    const lines = readFileSync(join(dir, name.slice(0, -4)), "utf8").split(
      "\n",
    );
    const chunk = name.replace(/-[^-]+\.js\.map$/, "");
    let sourceIndex = 0;
    map.mappings.split(";").forEach((line, lineIndex) => {
      let column = 0;
      const segments = [];
      for (const segment of line.split(",")) {
        if (!segment) {
          continue;
        }
        const fields = decodeSegment(segment);
        column += fields[0];
        if (fields.length >= 4) {
          sourceIndex += fields[1];
          segments.push([column, sourceIndex]);
        } else {
          segments.push([column, null]);
        }
      }
      segments.forEach(([start, source], index) => {
        if (source === null) {
          return;
        }
        const end =
          segments[index + 1]?.[0] ?? lines[lineIndex]?.length ?? start;
        const key = `${chunk}\t${ownerOf(map.sources[source])}`;
        totals.set(key, (totals.get(key) ?? 0) + end - start);
      });
    });
  }
  return totals;
};

const out = mkdtempSync(join(tmpdir(), "dashboard-bundle-"));
try {
  execFileSync(
    "pnpm",
    ["exec", "vite", "build", "--sourcemap", "--outDir", out, "--emptyOutDir"],
    {
      stdio: ["ignore", "ignore", "inherit"],
      env: { VITE_API_URL: "https://api.app.4mica.io", ...process.env },
    },
  );

  const totals = attribute(join(out, "assets"));
  const byChunk = new Map();
  for (const [key, bytes] of totals) {
    const [chunk, owner] = key.split("\t");
    byChunk.set(chunk, [...(byChunk.get(chunk) ?? []), [owner, bytes]]);
  }
  const size = (rows) => rows.reduce((sum, [, bytes]) => sum + bytes, 0);
  const chunks = [...byChunk].sort((a, b) => size(b[1]) - size(a[1]));

  for (const [chunk, rows] of chunks.slice(0, TOP)) {
    console.log(`\n${chunk}  ${(size(rows) / 1024).toFixed(1)} kB minified`);
    for (const [owner, bytes] of rows
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)) {
      console.log(`  ${(bytes / 1024).toFixed(1).padStart(8)} kB  ${owner}`);
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
