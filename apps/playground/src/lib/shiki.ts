import "server-only";

import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export type CodeLang = "typescript" | "python" | "bash" | "json";

const THEME = "vesper";

const HIGHLIGHT_CACHE_LIMIT = 500;

let highlighterPromise: Promise<HighlighterCore> | null = null;

const highlighted = new Map<string, string>();

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import("shiki/themes/vesper.mjs")],
      langs: [
        import("shiki/langs/typescript.mjs"),
        import("shiki/langs/python.mjs"),
        import("shiki/langs/bash.mjs"),
        import("shiki/langs/json.mjs"),
      ],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

export async function highlight(code: string, lang: CodeLang): Promise<string> {
  const key = `${lang}\u0000${code}`;
  const hit = highlighted.get(key);

  if (hit !== undefined) {
    return hit;
  }

  const html = await render(code, lang);

  if (highlighted.size >= HIGHLIGHT_CACHE_LIMIT) {
    const oldest = highlighted.keys().next().value;

    if (oldest !== undefined) {
      highlighted.delete(oldest);
    }
  }

  highlighted.set(key, html);

  return html;
}

async function render(code: string, lang: CodeLang): Promise<string> {
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
