"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type CodeBlock = {
  language?: string;
  caption?: string;
  code: string;
  label?: string;
};

type LanguageId = "typescript" | "python" | "rust" | "api";

const languageLabels: Record<string, string> = {
  bash: "Shell",
  sh: "Shell",
  http: "HTTP",
  js: "JavaScript",
  javascript: "JavaScript",
  json: "JSON",
  py: "Python",
  python: "Python",
  rs: "Rust",
  rust: "Rust",
  toml: "TOML",
  ts: "TypeScript",
  typescript: "TypeScript",
  yaml: "YAML",
  yml: "YAML",
};

const getLabel = (block: CodeBlock, index: number) => {
  if (block.label) {
    return block.label;
  }
  if (block.language) {
    return (
      languageLabels[block.language.toLowerCase()] ??
      block.language.toUpperCase()
    );
  }
  return `Code ${index + 1}`;
};

const getBlockKey = (block: CodeBlock) =>
  block.label ?? block.caption ?? block.language ?? block.code.slice(0, 48);

const getLineKey = (line: string, counts: Map<string, number>) => {
  const count = counts.get(line) ?? 0;
  counts.set(line, count + 1);
  return `${line || "blank"}-${count}`;
};

const resolveLanguageId = (language?: string): LanguageId | null => {
  if (!language) {
    return null;
  }
  const normalized = language.toLowerCase();
  if (["ts", "typescript", "js", "javascript"].includes(normalized)) {
    return "typescript";
  }
  if (["py", "python"].includes(normalized)) {
    return "python";
  }
  if (["rs", "rust"].includes(normalized)) {
    return "rust";
  }
  if (
    ["http", "bash", "sh", "json", "yaml", "yml", "toml"].includes(normalized)
  ) {
    return "api";
  }
  return null;
};

type TokenPattern = {
  regex: RegExp;
  classes: string[];
};

const tokenPatterns: Record<LanguageId, TokenPattern> = {
  typescript: {
    regex:
      /(\/\/.*$)|(`[^`]*`|'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*")|(\b0x[0-9a-fA-F]+\b|\b\d+(?:_\d+)*(?:\.\d+)?\b)|(\b(?:import|from|async|function|const|let|await|return|new|class|export|default|try|catch|throw|if|else|for|while)\b)|(\b(?:console|Math|Date|BigInt|Number|String|Boolean|Object|process|Promise)\b)/g,
    classes: ["comment", "string", "number", "keyword", "builtin"],
  },
  python: {
    regex:
      /(#.*$)|('''[^']*'''|"""[^"]*"""|'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*")|(\b0x[0-9a-fA-F]+\b|\b\d+(?:_\d+)*(?:\.\d+)?\b)|(\b(?:import|from|async|def|await|return|class|try|except|raise|if|elif|else|for|while|with|as|in|None|True|False)\b)/g,
    classes: ["comment", "string", "number", "keyword"],
  },
  rust: {
    regex:
      /(\/\/.*$)|(b?"[^"\\]*(?:\\.[^"\\]*)*"|b?'[^'\\]*(?:\\.[^'\\]*)*')|(\b0x[0-9a-fA-F_]+\b|\b\d+(?:_\d+)*(?:\.\d+)?\b)|(\b(?:use|let|mut|async|await|fn|pub|struct|impl|match|if|else|for|while|loop|return|crate|mod|enum|trait|Result|Ok|Err|Some|None)\b)|(\b\w+!)/g,
    classes: ["comment", "string", "number", "keyword", "macro"],
  },
  api: {
    regex:
      /(#.*$)|('[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*")|(\b\d+(?:\.\d+)?\b)|(\b(?:curl|POST|GET|PUT|PATCH|DELETE)\b)|(--?[A-Za-z-]+)|(\$[A-Z0-9_]+)\b/g,
    classes: ["comment", "string", "number", "keyword", "flag", "variable"],
  },
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const highlightLine = (line: string, language: LanguageId) => {
  const pattern = tokenPatterns[language];
  let result = "";
  let lastIndex = 0;
  pattern.regex.lastIndex = 0;
  let match = pattern.regex.exec(line);
  while (match) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      result += escapeHtml(line.slice(lastIndex, index));
    }
    const groupIndex = match.slice(1).findIndex((group) => group !== undefined);
    const className = groupIndex >= 0 ? pattern.classes[groupIndex] : "";
    const tokenValue = escapeHtml(match[0]);
    result += className
      ? `<span class="code-token ${className}">${tokenValue}</span>`
      : tokenValue;
    lastIndex = index + match[0].length;
    match = pattern.regex.exec(line);
  }
  if (lastIndex < line.length) {
    result += escapeHtml(line.slice(lastIndex));
  }
  return result;
};

export default function CodeTabs({
  blocks,
  className,
  contentClassName,
  hideTabs,
}: {
  blocks: CodeBlock[];
  className?: string;
  contentClassName?: string;
  hideTabs?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const baseId = useId();
  const activeBlock = blocks[activeIndex] ?? blocks[0];
  const languageId = resolveLanguageId(activeBlock?.language);
  const showTabs = !(hideTabs || blocks.length <= 1);
  const contentPadding = contentClassName ?? "p-4 sm:p-5";

  const codeLines = useMemo(
    () => (activeBlock?.code ?? "").trimEnd().split("\n"),
    [activeBlock?.code],
  );
  const highlightedLines = useMemo(
    () =>
      codeLines.map((line) =>
        languageId ? highlightLine(line, languageId) : escapeHtml(line),
      ),
    [codeLines, languageId],
  );

  const handleCopy = async (code: string, index: number) => {
    if (!code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCopiedIndex(index);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedIndex(null);
      }, 1600);
    } catch {
      setCopiedIndex(null);
    }
  };

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className={`rounded-xl border border-white/10 bg-surface-solid text-ink-body text-sm ${
        className ?? ""
      }`}
    >
      {activeBlock?.caption && (
        <div className="px-4 pt-4 text-brand text-xs uppercase tracking-wide">
          {activeBlock.caption}
        </div>
      )}
      {showTabs && (
        <div
          role="tablist"
          aria-label="Code languages"
          className={`flex flex-wrap items-center justify-between gap-2 border-white/10 border-b bg-surface-solid px-3 py-2 ${
            activeBlock?.caption ? "mt-3" : ""
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {blocks.map((block, idx) => {
              const isActive = idx === activeIndex;
              const blockKey = getBlockKey(block);
              return (
                <button
                  key={`${baseId}-tab-${blockKey}`}
                  id={`${baseId}-tab-${idx}`}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-controls={`${baseId}-panel-${idx}`}
                  onClick={() => setActiveIndex(idx)}
                  className={`rounded-full px-3 py-1 font-semibold text-xs transition ${
                    isActive
                      ? "bg-white/15 text-ink-strong shadow-sm"
                      : "text-ink-muted hover:text-ink-strong"
                  }`}
                >
                  {getLabel(block, idx)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => handleCopy(activeBlock?.code ?? "", activeIndex)}
            className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-semibold text-xs transition ${
              copiedIndex === activeIndex
                ? "text-brand"
                : "text-ink-muted hover:text-ink-strong"
            }`}
            aria-label="Copy code to clipboard"
          >
            <i
              className={
                copiedIndex === activeIndex
                  ? "ri-check-line"
                  : "ri-file-copy-line"
              }
            ></i>
            <span className="hidden sm:inline">
              {copiedIndex === activeIndex ? "Copied" : "Copy"}
            </span>
          </button>
        </div>
      )}
      {!showTabs && (
        <div
          className={`flex items-center justify-end border-white/10 border-b bg-surface-solid px-3 py-2 ${
            activeBlock?.caption ? "mt-3" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => handleCopy(activeBlock?.code ?? "", activeIndex)}
            className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-semibold text-xs transition ${
              copiedIndex === activeIndex
                ? "text-brand"
                : "text-ink-muted hover:text-ink-strong"
            }`}
            aria-label="Copy code to clipboard"
          >
            <i
              className={
                copiedIndex === activeIndex
                  ? "ri-check-line"
                  : "ri-file-copy-line"
              }
            ></i>
            <span className="hidden sm:inline">
              {copiedIndex === activeIndex ? "Copied" : "Copy"}
            </span>
          </button>
        </div>
      )}

      {blocks.map((block, idx) => {
        const isActive = idx === activeIndex;
        const blockKey = getBlockKey(block);
        const lineCounts = new Map<string, number>();
        const tabPanelProps = showTabs
          ? {
              role: "tabpanel",
              "aria-labelledby": `${baseId}-tab-${idx}`,
            }
          : {};
        return (
          <div
            key={`${baseId}-panel-${blockKey}`}
            id={`${baseId}-panel-${idx}`}
            {...tabPanelProps}
            hidden={!isActive}
            className={!isActive ? "hidden" : undefined}
          >
            <div className={`bg-surface-solid ${contentPadding}`}>
              <div className="space-y-1 font-mono text-ink-strong text-xs leading-relaxed sm:text-sm">
                {codeLines.map((line, lineIndex) => (
                  <div
                    key={`${blockKey}-${getLineKey(line, lineCounts)}`}
                    className="grid grid-cols-[2.2rem_1fr] gap-3"
                  >
                    <span className="select-none text-right text-[10px] text-ink-subtle sm:text-xs">
                      {lineIndex + 1}
                    </span>
                    <span
                      className="whitespace-pre"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: highlightLine escapes code before adding syntax spans.
                      dangerouslySetInnerHTML={{
                        __html: highlightedLines[lineIndex] || " ",
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
