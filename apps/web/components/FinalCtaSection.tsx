"use client";

import Link from "next/link";

const BLUE = "#7bcbff";

const STATS = [
  { value: "1 tx", label: "per settlement" },
  { value: "~0", label: "gas per call" },
  { value: "APY", label: "on collateral" },
];

export default function FinalCtaSection() {
  return (
    <section className="section-gloss py-24">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-kicker">Start building</p>
          <h2 className="section-title">Stop paying per transaction.</h2>
          <p className="mx-auto mt-4 max-w-md text-base text-ink-muted leading-relaxed">
            Add a credit layer. Batch thousands of payments. Settle once. Your
            collateral earns yield while your agents scale.
          </p>

          {/* Stats */}
          <div className="mt-10 flex items-center justify-center gap-6">
            {STATS.map((s, i) => (
              <div key={s.label} className="contents">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="font-bold text-2xl tabular-nums"
                    style={{ color: BLUE }}
                  >
                    {s.value}
                  </span>
                  <span className="text-ink-subtle text-xs">{s.label}</span>
                </div>
                {i < STATS.length - 1 && (
                  <div className="h-8 w-px bg-white/10" />
                )}
              </div>
            ))}
          </div>

          {/* Divider between stats */}
          <div className="mt-10 flex flex-col justify-center gap-3 border-white/8 border-t pt-10 sm:flex-row">
            <Link
              href="/resources/technical-docs"
              className="btn btn-primary btn-lg text-center font-bold"
            >
              Start Building
            </Link>
            <Link
              href="https://github.com/4mica-Network/4mica-core/"
              target="_blank"
              rel="noreferrer"
              className="btn btn-soft btn-lg text-center"
            >
              <i className="ri-github-fill" />
              View Source
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
