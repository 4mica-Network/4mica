"use client";

import { useState } from "react";

export type LangId = "typescript" | "python";
export type Side = "client" | "server";

export type CodeHtml = Record<Side, Record<LangId, string>>;

export default function CodeSamplesPanel({ html }: { html: CodeHtml }) {
  const [lang, setLang] = useState<LangId>("typescript");
  const [side, setSide] = useState<Side>("client");

  return (
    <section id="integration" className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <div className="w-full">
          {/* Header */}
          <div className="mb-10">
            <p className="section-kicker">Integration</p>
            <h2 className="section-title mt-2 font-normal">
              3 lines to enable credit-based payments
            </h2>
            <p className="section-lead mt-1 max-w-xl">
              Works with your existing HTTP client. No contract changes. No new
              wallet. Fully x402-compatible.
            </p>
          </div>

          {/* Code panel */}
          <div className="group relative w-full overflow-hidden rounded-md border border-white/10 bg-black/25">
            <div className="pointer-events-none absolute inset-0 z-20 rounded-md border border-white/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <div
              className="pointer-events-none absolute inset-0 z-20 rounded-md opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={{
                padding: "1px",
                background:
                  "linear-gradient(115deg, rgba(255,255,255,0), rgba(255,255,255,0.36), rgba(255,255,255,0.04), rgba(255,255,255,0))",
                mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                maskComposite: "exclude",
                WebkitMask:
                  "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                WebkitMaskComposite: "xor",
              }}
            />
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-white/10 border-b bg-black/40 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-md bg-red-500/80" />
                <div className="h-2.5 w-2.5 rounded-md bg-yellow-500/80" />
                <div className="h-2.5 w-2.5 rounded-md bg-green-500/80" />
                <span className="ml-2 truncate text-[10px] text-white uppercase tracking-wider">
                  {side === "client" ? "agent / client" : "api / server"} ·{" "}
                  {lang}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex overflow-hidden rounded-md border border-white/10">
                  {(["client", "server"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSide(s)}
                      className={`px-3 py-1 font-semibold text-md capitalize transition ${
                        side === s
                          ? "bg-white/15 text-ink-strong"
                          : "text-ink-muted hover:text-ink-body"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex overflow-hidden rounded-md border border-white/10">
                  {(["typescript", "python"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLang(l)}
                      className={`px-3 py-1 font-semibold text-md capitalize transition ${
                        lang === l
                          ? "bg-white/15 text-ink-strong"
                          : "text-ink-muted hover:text-ink-body"
                      }`}
                    >
                      {l === "typescript" ? "TS" : "PY"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Code body */}
            <div className="max-w-full overflow-x-auto bg-black p-5 transition-colors duration-500 group-hover:bg-[#050505] sm:p-6">
              <div
                className="shiki-code shiki-numbered font-mono text-md leading-6"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki escapes source text at build time; html contains only its own token markup.
                dangerouslySetInnerHTML={{ __html: html[side][lang] }}
              />
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 border-white/10 border-t bg-black/25 px-5 py-3 text-ink-subtle text-md">
              <i className="ri-code-box-line shrink-0 text-2xl text-ink-strong" />
              <div className="flex flex-col">
                <span className="font-medium text-ink-strong">
                  SDKs are available
                </span>
                <span className="font-light text-ink-muted">
                  Available now in{" "}
                  <span className="font-semibold text-ink-body">
                    TypeScript
                  </span>{" "}
                  & <span className="font-semibold text-ink-body">Python</span>{" "}
                  · <span className="font-semibold text-ink-body">Rust</span>{" "}
                  coming soon
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
