import fs from "node:fs";
import path from "node:path";
import { tocFromMarkdown } from "@components/legal/tocFromMarkdown";
import type { TocItem } from "@components/TableOfContent";

export function readToc(relativePath: string): TocItem[] {
  const filePath = path.join(process.cwd(), relativePath);
  return tocFromMarkdown(fs.readFileSync(filePath, "utf-8"));
}
