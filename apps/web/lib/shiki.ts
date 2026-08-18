import "server-only";

import { createHighlighter, type Highlighter } from "shiki";

export type CodeLang = "typescript" | "python";

const THEME = "vesper";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [THEME],
      langs: ["typescript", "python"],
    });
  }
  return highlighterPromise;
}

export async function highlight(code: string, lang: CodeLang): Promise<string> {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code.trimEnd(), {
    lang,
    theme: THEME,
    transformers: [
      {
        pre(node) {
          const style = node.properties.style;
          if (typeof style === "string") {
            node.properties.style = style
              .split(";")
              .filter((decl) => {
                const prop = decl.trim().toLowerCase();
                return prop && !prop.startsWith("background");
              })
              .join(";");
          }
        },
      },
    ],
  });
}
