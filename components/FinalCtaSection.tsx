'use client';

import Link from 'next/link';

const BLUE = '#7bcbff';

const STATS = [
  { value: '1 tx', label: 'per settlement' },
  { value: '~0', label: 'gas per call' },
  { value: 'APY', label: 'on collateral' },
];

export default function FinalCtaSection() {
  return (
    <section className="py-24 section-gloss">
      <div className="container mx-auto px-6">
        <div className="max-w-2xl mx-auto text-center">

          <p className="section-kicker">Start building</p>
          <h2 className="section-title">Stop paying per transaction.</h2>
          <p className="mt-4 text-base text-ink-muted leading-relaxed max-w-md mx-auto">
            Add a credit layer. Batch thousands of payments. Settle once.
            Your collateral earns yield while your agents scale.
          </p>

          {/* Stats */}
          <div className="mt-10 flex justify-center items-center gap-6">
            {STATS.map((s, i) => (
              <div key={s.label} className="contents">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-2xl font-bold tabular-nums" style={{ color: BLUE }}>
                    {s.value}
                  </span>
                  <span className="text-xs text-ink-subtle">{s.label}</span>
                </div>
                {i < STATS.length - 1 && (
                  <div className="w-px h-8 bg-white/10" />
                )}
              </div>
            ))}
          </div>

          {/* Divider between stats */}
          <div className="mt-10 border-t border-white/8 pt-10 flex flex-col sm:flex-row justify-center gap-3">
            <Link href="/resources/technical-docs" className="btn btn-primary btn-lg text-center font-bold">
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
