import { slugify } from "@components/slugify";
import type { TocItem } from "@components/TableOfContent";

export function tocFromMarkdown(raw: string): TocItem[] {
  const headings = raw.match(/^##\s.+/gm) ?? [];

  return headings.map((heading) => {
    const text = heading.replace(/^##\s/, "").trim();
    return { id: slugify(text), text };
  });
}
