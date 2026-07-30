import { slugify } from "@components/slugify";
import type { TocItem } from "@components/TableOfContent";

/**
 * Build a table of contents from the `##` headings of markdown/MDX source.
 * Ids come from `slugify` — the same helper `mdx-components.tsx` uses for the
 * rendered `<h2 id>`, so every entry anchors to a real heading.
 *
 * Kept free of `node:fs` so modules that only need the parsing (e.g.
 * `lib/blog.ts`) do not drag filesystem access into their import graph.
 */
export function tocFromMarkdown(raw: string): TocItem[] {
  const headings = raw.match(/^##\s.+/gm) ?? [];

  return headings.map((heading) => {
    const text = heading.replace(/^##\s/, "").trim();
    return { id: slugify(text), text };
  });
}
