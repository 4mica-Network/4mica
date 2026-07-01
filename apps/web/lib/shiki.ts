import "server-only";

import { createHighlighter, type Highlighter } from "shiki";

export type CodeLang = "typescript" | "python";

const THEME = "vesper";

// A single highlighter instance is reused across the whole build. Shiki only
// runs at build time here (Server Components under `output: "export"`), so its
// grammars/WASM never ship to the browser — we emit plain pre-rendered HTML.
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

/**
 * Highlight `code` with the Vesper (Vercel-like) theme and return HTML.
 * Output is already escaped by Shiki, so it is safe for dangerouslySetInnerHTML.
 */
export async function highlight(code: string, lang: CodeLang): Promise<string> {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code.trimEnd(), {
    lang,
    theme: THEME,
    transformers: [
      {
        // Drop Vesper's own background so the panel's black surface shows
        // through; keep the token colors. Avoids needing !important in CSS.
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
