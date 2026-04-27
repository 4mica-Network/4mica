'use client';

import Link from 'next/link';

export default function FinalCtaSection() {
  return (
    <section className="py-24 section-gloss">
      <div className="container mx-auto px-6">
        <div
          className="glass-panel rounded-3xl p-10 sm:p-14 text-center max-w-3xl mx-auto"
          style={{ borderColor: 'rgb(var(--brand) / 0.15)' }}
        >
          {/* Kicker */}
          <p className="section-kicker mb-4">Start building</p>

          {/* Headline */}
          <h2 className="section-title">Stop paying per transaction.</h2>

          {/* Sub */}
          <p className="section-lead max-w-md mx-auto">
            Add a credit layer. Batch thousands of payments. Settle once.
            Your collateral earns yield while your agents scale.
          </p>

          {/* Stat trio */}
          <div className="mt-8 grid grid-cols-3 gap-3 max-w-sm mx-auto">
            {[
              { value: '1 tx', label: 'settlement', color: 'rgb(var(--color-success))' },
              { value: '~0', label: 'gas per call', color: 'rgb(var(--brand))' },
              { value: 'APY', label: 'on collateral', color: '#c084fc' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl px-3 py-3" style={{ background: s.color + '10', border: `1px solid ${s.color}25` }}>
                <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] text-ink-subtle mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
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
