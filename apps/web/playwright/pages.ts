import { readFileSync } from "node:fs";
import path from "node:path";

const sitemapPath = path.resolve(__dirname, "../out/sitemap.xml");

export const SITE_PATHS: string[] = (() => {
  let xml: string;

  try {
    xml = readFileSync(sitemapPath, "utf8");
  } catch {
    throw new Error(
      `${sitemapPath} is missing. Run \`pnpm --filter @4mica/web build\` first.`,
    );
  }

  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    ([, loc]) => new URL(loc).pathname,
  );

  return [...new Set(paths)].sort();
})();

export const LEAKED_TEXT = /\bundefined\b|\[object Object\]|\bNaN\b|\{\{|\}\}/;
