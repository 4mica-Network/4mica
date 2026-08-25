import "server-only";

import { createHighlighter, type Highlighter } from "shiki";

export type CodeLang = "typescript" | "python" | "bash" | "json";

/**
 * Vesper is a dark-only theme — it has no light counterpart. Code frames
 * therefore carry their own dark ground (`.code-surface`) instead of following
 * the page theme, or light mode would render near-black tokens on white.
 */
const THEME = "vesper";

const LANGS: CodeLang[] = ["typescript", "python", "bash", "json"];

/**
 * Loading the WASM highlighter costs ~100ms and several MB, so it is created
 * once per process and shared. The promise (not the resolved value) is cached
 * so concurrent requests during warm-up await the same load.
 */
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes: [THEME], langs: LANGS });
  }
  return highlighterPromise;
}

/**
 * Render `code` to token markup. Runs on the server only — no highlighter ever
 * reaches the browser bundle.
 */
export async function highlight(code: string, lang: CodeLang): Promise<string> {
  const highlighter = await getHighlighter();

  return highlighter.codeToHtml(code.trimEnd(), {
    lang,
    theme: THEME,
    transformers: [
      {
        // Drop the theme's own background so the frame's surface shows
        // through; keep every other declaration (token colours).
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
