import { cn } from "@4mica/ui";
import { CopyButton } from "@/components/CopyButton";
import { type CodeLang, highlight } from "@/lib/shiki";

const LANG_LABEL: Record<CodeLang, string> = {
  typescript: "TypeScript",
  python: "Python",
  bash: "Shell",
  json: "JSON",
};

export interface CodeBlockProps {
  code: string;
  lang: CodeLang;
  /** Header caption. Falls back to the language name. */
  label?: string;
  /** Off by default — line numbers are noise on a one-line install command. */
  showLineNumbers?: boolean;
  className?: string;
}

/**
 * A server component: shiki runs at render time and only its token markup is
 * sent, so no highlighter ever reaches the browser bundle.
 *
 * The frame keeps its own dark ground (`.code-surface`) in both themes because
 * the Vesper theme has no light variant — see src/lib/shiki.ts.
 */
export async function CodeBlock({
  code,
  lang,
  label,
  showLineNumbers = false,
  className,
}: CodeBlockProps) {
  const html = await highlight(code, lang);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-overlay/10",
        className,
      )}
    >
      <div className="code-surface flex items-center justify-between gap-2 border-white/10 border-b px-4 py-2">
        <span className="truncate text-2xs uppercase tracking-wider opacity-60">
          {label ?? LANG_LABEL[lang]}
        </span>
        {/* The unhighlighted source, so a paste is runnable code. */}
        <CopyButton value={code} />
      </div>

      <div className="code-surface overflow-x-auto p-4">
        <div
          className={cn(
            "shiki-code font-mono text-md leading-6",
            showLineNumbers && "shiki-numbered",
          )}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki escapes the source at render time; `html` contains only its own token markup.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
