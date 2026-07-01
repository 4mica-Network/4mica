import fs from "node:fs";
import path from "node:path";

import { highlight } from "@lib/shiki";
import CodeSamplesPanel, { type CodeHtml } from "./CodeSamplesPanel";

const SNIPPET_DIR = path.join(process.cwd(), "app/_components/snippets");

const read = (file: string) =>
  fs.readFileSync(path.join(SNIPPET_DIR, file), "utf8");

export default async function CodeSamplesSection() {
  const html: CodeHtml = {
    client: {
      typescript: await highlight(read("client.ts"), "typescript"),
      python: await highlight(read("client.py"), "python"),
    },
    server: {
      typescript: await highlight(read("server.ts"), "typescript"),
      python: await highlight(read("server.py"), "python"),
    },
  };

  return <CodeSamplesPanel html={html} />;
}
