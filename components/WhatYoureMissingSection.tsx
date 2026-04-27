'use client';

const SCENARIO = {
  capital:            10_000,
  gasCostX402:         1_000,
  x402LatencyHours:      278,  // 1M txs × 1 s avg block time ÷ 3600
  micaLatencyHours:      2.7,  // 1M txs × 10 ms BLS sign + verify ÷ 3_600_000
  yieldRate:            0.05,
};

const x402Lines = [
  { label: 'Capital locked in wallet',         value: `$${SCENARIO.capital.toLocaleString()} USDC`,         note: 'earns 0%, just sitting there' },
  { label: 'Yield earned',                     value: '$0',                                                  note: 'no yield mechanism' },
  { label: 'Gas fees paid (1M on-chain txs)',  value: `+$${SCENARIO.gasCostX402.toLocaleString()} USDC`,    note: '~$0.001 × 1,000,000 settlements' },
  { label: 'Time waiting for finality',        value: `${SCENARIO.x402LatencyHours} hours`,                  note: '1M txs × ~1 s avg block time' },
];

const micaLines = [
  { label: 'Capital deployed in Aave vault',  value: `$${SCENARIO.capital.toLocaleString()} USDC`,                          note: 'non-custodial · withdraw anytime' },
  { label: 'Yield earned over 1 year',        value: `+$${(SCENARIO.capital * SCENARIO.yieldRate).toLocaleString()} USDC`,  note: '~5% Aave USDC APY' },
  { label: 'Gas fees',                         value: '< $1',                                                               note: 'batch + netting · sponsored · $0 for payer' },
  { label: 'Time waiting for finality',        value: `${SCENARIO.micaLatencyHours} hours`,                                  note: '10ms BLS signature + verification per request' },
];

const x402Total = SCENARIO.capital + SCENARIO.gasCostX402;
const micaNet   = SCENARIO.capital - SCENARIO.capital * SCENARIO.yieldRate;
const netDelta  = x402Total - micaNet;

const RED   = '#f87171';
const GREEN = '#4ade80';

export default function WhatYoureMissingSection() {
  return (
    <section className="py-20 section-gloss">
      <div className="container mx-auto px-6">

        <div className="text-center mb-10">
          <p className="section-kicker">The real cost</p>
          <h2 className="section-title">Agentic economy breaks at scale.</h2>
          <p className="section-lead max-w-xl mx-auto">
            1M API calls, 10k USDC volume, 1 year.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-4xl mx-auto items-stretch">

          {/* x402 */}
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{ border: `1px solid ${RED}25` }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ background: `${RED}0d` }}>
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: RED }}>x402</p>
                <p className="text-xs text-ink-subtle mt-0.5">per-transaction settlement</p>
              </div>
              <i className="ri-close-circle-line text-xl" style={{ color: RED }} />
            </div>
            <div className="px-6 py-5 flex flex-col flex-1">
              <div className="space-y-5 flex-1">
                {x402Lines.map((line) => (
                  <div key={line.label} className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-ink-body">{line.label}</p>
                      <p className="text-xs text-ink-subtle mt-0.5">{line.note}</p>
                    </div>
                    <span className="text-base font-bold tabular-nums shrink-0" style={{ color: RED }}>{line.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-strong">Total cost</span>
                <span className="text-lg font-bold" style={{ color: RED }}>${x402Total.toLocaleString()} USDC</span>
              </div>
            </div>
          </div>

          {/* 4Mica */}
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{ border: `1px solid ${GREEN}25` }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ background: `${GREEN}0d` }}>
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: GREEN }}>With 4Mica</p>
                <p className="text-xs text-ink-subtle mt-0.5">credit layer + batch settlement</p>
              </div>
              <i className="ri-checkbox-circle-line text-xl" style={{ color: GREEN }} />
            </div>
            <div className="px-6 py-5 flex flex-col flex-1">
              <div className="space-y-5 flex-1">
                {micaLines.map((line) => (
                  <div key={line.label} className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-ink-body">{line.label}</p>
                      <p className="text-xs text-ink-subtle mt-0.5">{line.note}</p>
                    </div>
                    <span className="text-base font-bold tabular-nums shrink-0" style={{ color: GREEN }}>{line.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-strong">Net cost</span>
                <span className="text-lg font-bold" style={{ color: GREEN }}>${micaNet.toLocaleString()} USDC</span>
              </div>
            </div>
          </div>
        </div>

        {/* Delta */}
        <div className="mt-6 max-w-4xl mx-auto glass-panel rounded-2xl px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-ink-muted">Same 1M calls. Same starting capital.</p>
          <p className="text-lg font-bold text-ink-strong whitespace-nowrap">
            <span style={{ color: GREEN }}>${netDelta.toLocaleString()} saved</span>
            <span className="text-ink-subtle mx-2">·</span>
            <span style={{ color: GREEN }}>{SCENARIO.x402LatencyHours - SCENARIO.micaLatencyHours} hours reclaimed</span>
          </p>
        </div>

      </div>
    </section>
  );
}
