import fs from "node:fs";
import path from "node:path";
import { slugify } from "@components/slugify";
import type { TocItem } from "@components/TableOfContent";

/**
 * Build a table of contents from the `##` headings of an MDX file.
 * `relativePath` is resolved from the app root (process.cwd()) at build time.
 */
export function readToc(relativePath: string): TocItem[] {
  const filePath = path.join(process.cwd(), relativePath);
  const raw = fs.readFileSync(filePath, "utf-8");
  const headings = raw.match(/^##\s.+/gm) ?? [];

  return headings.map((heading) => {
    const text = heading.replace(/^##\s/, "").trim();
    return { id: slugify(text), text };
  });
}
