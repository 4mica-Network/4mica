"use client";

import { STEPS } from "../data";

// Single accent color for all steps
const ACCENT = "#7bcbff";

const getCodeLineKey = (line: string, counts: Map<string, number>) => {
  const count = counts.get(line) ?? 0;
  counts.set(line, count + 1);
  return `${line || "blank"}-${count}`;
};

export default function DocsCalloutSection() {
  return (
    <section id="how-it-works" className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <div className="mb-16 text-center">
          <p className="section-kicker">How it works</p>
          <h3 className="section-title mx-auto max-w-3xl">
            Separate payment authorization from settlement
          </h3>
          <p className="section-lead mx-auto max-w-xl">
            Pay with programmable cryptographic credit. Settle thousands of
            payments in one on-chain transaction.
          </p>
        </div>

        <div className="w-full space-y-4">
          {STEPS.map((step, i) => {
            const lineCounts = new Map<string, number>();

            return (
              <div
                key={step.num}
                className="glass-panel overflow-hidden rounded-md"
              >
                <div className="grid gap-0 lg:grid-cols-[1fr_1.2fr]">
                  {/* Left */}
                  <div className="flex min-w-0 flex-col justify-between border-white/10 border-b p-6 sm:p-8 lg:border-r lg:border-b-0">
                    <div>
                      <div className="mb-4 flex items-center gap-3">
                        <span className="font-bold text-3xl text-white/25 leading-none">
                          {step.num}
                        </span>
                        <span
                          className="rounded-md px-2 py-1 font-semibold text-md uppercase tracking-widest"
                          style={{
                            background: `${ACCENT}15`,
                            color: ACCENT,
                            border: `1px solid ${ACCENT}30`,
                          }}
                        >
                          {step.badge}
                        </span>
                      </div>
                      <h3 className="font-semibold text-ink-strong text-md">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-ink-muted text-md leading-relaxed">
                        {step.desc}
                      </p>
                    </div>

                    {i < STEPS.length - 1 && (
                      <div className="mt-6 hidden items-center gap-2 lg:flex">
                        <div className="h-px flex-1 bg-white/10" />
                        <i className="ri-arrow-down-line text-md text-white/35" />
                      </div>
                    )}
                  </div>

                  {/* Right */}
                  <div className="min-w-0 bg-[#050b1d] p-5 sm:p-6">
                    <div className="mb-4 flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-md bg-white/20" />
                      <div className="h-2.5 w-2.5 rounded-md bg-white/20" />
                      <div className="h-2.5 w-2.5 rounded-md bg-white/20" />
                      <span className="ml-2 text-[10px] text-white/45 uppercase tracking-wider">
                        {step.badge}
                      </span>
                    </div>
                    <pre className="max-w-full overflow-x-auto whitespace-pre font-mono text-md leading-6">
                      {step.code.split("\n").map((line) => {
                        const key = getCodeLineKey(line, lineCounts);

                        if (line.startsWith("//")) {
                          return (
                            <div
                              key={key}
                              style={{
                                color: "rgba(148,163,184,0.6)",
                                fontStyle: "italic",
                              }}
                            >
                              {line}
                            </div>
                          );
                        }
                        if (
                          line.startsWith("Alice") ||
                          line.startsWith("Bob") ||
                          line.startsWith("gross") ||
                          line.startsWith("net_") ||
                          line.startsWith("55 ") ||
                          line.startsWith("Merkle")
                        ) {
                          return (
                            <div
                              key={key}
                              style={{ color: "rgba(148,163,184,0.75)" }}
                            >
                              {line}
                            </div>
                          );
                        }
                        if (
                          line.startsWith("await") ||
                          line.startsWith("const") ||
                          line.startsWith("});") ||
                          line.startsWith(");")
                        ) {
                          return (
                            <div key={key} style={{ color: "#7dd3fc" }}>
                              {line}
                            </div>
                          );
                        }
                        return (
                          <div
                            key={key}
                            style={{ color: "rgba(200,215,242,0.9)" }}
                          >
                            {line}
                          </div>
                        );
                      })}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mx-auto mt-10 max-w-2xl text-center">
          <div className="glass-panel rounded-md px-8 py-6">
            <p className="font-semibold text-ink-strong text-md">
              Replace thousands of transactions with{" "}
              <span style={{ color: ACCENT }}>
                one net settlement per cycle
              </span>
            </p>
            <p className="mt-2 text-ink-muted text-md">
              Same x402 protocol. Same HTTP clients. Add 4Mica to scale.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
