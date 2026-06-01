"use client";

const SCENARIO = {
  capital: 10_000,
  gasCostX402: 1_000,
  x402LatencyHours: 278, // 1M txs × 1 s avg block time ÷ 3600
  micaLatencyHours: 2.7, // 1M txs × 10 ms BLS sign + verify ÷ 3_600_000
  yieldRate: 0.05,
};

const x402Lines = [
  {
    label: "Capital locked in wallet",
    value: `$${SCENARIO.capital.toLocaleString()} USDC`,
    note: "earns 0%, just sitting there",
  },
  { label: "Yield earned", value: "$0", note: "no yield mechanism" },
  {
    label: "Gas fees paid (1M on-chain txs)",
    value: `+$${SCENARIO.gasCostX402.toLocaleString()} USDC`,
    note: "~$0.001 × 1,000,000 settlements",
  },
  {
    label: "Time waiting for finality",
    value: `${SCENARIO.x402LatencyHours} hours`,
    note: "1M txs × ~1 s avg block time",
  },
];

const micaLines = [
  {
    label: "Capital deployed in Aave vault",
    value: `$${SCENARIO.capital.toLocaleString()} USDC`,
    note: "non-custodial · withdraw anytime",
  },
  {
    label: "Yield earned over 1 year",
    value: `+$${(SCENARIO.capital * SCENARIO.yieldRate).toLocaleString()} USDC`,
    note: "~5% Aave USDC APY",
  },
  {
    label: "Gas fees",
    value: "< $1",
    note: "batch + netting · sponsored · $0 for payer",
  },
  {
    label: "Time waiting for finality",
    value: `${SCENARIO.micaLatencyHours} hours`,
    note: "10ms BLS signature + verification per request",
  },
];

const x402Total = SCENARIO.capital + SCENARIO.gasCostX402;
const micaNet = SCENARIO.capital - SCENARIO.capital * SCENARIO.yieldRate;
const netDelta = x402Total - micaNet;

const RED = "#f87171";
const GREEN = "#4ade80";

export default function WhatYoureMissingSection() {
  return (
    <section className="section-gloss py-20">
      <div className="container mx-auto px-6">
        <div className="mb-10 text-center">
          <p className="section-kicker">The real cost</p>
          <h2 className="section-title">Agentic economy breaks at scale.</h2>
          <p className="section-lead mx-auto max-w-xl">
            1M API calls, 10k USDC volume, 1 year.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
          {/* x402 */}
          <div
            className="flex flex-col overflow-hidden rounded-2xl"
            style={{ border: `1px solid ${RED}38` }}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ background: `${RED}12` }}
            >
              <div>
                <p
                  className="font-semibold text-sm uppercase tracking-widest"
                  style={{ color: RED }}
                >
                  x402
                </p>
                <p className="mt-0.5 text-ink-subtle text-xs">
                  per-transaction settlement
                </p>
              </div>
              <i
                className="ri-close-circle-line text-xl"
                style={{ color: RED }}
              />
            </div>
            <div className="flex flex-1 flex-col px-6 py-5">
              <div className="flex-1 space-y-5">
                {x402Lines.map((line) => (
                  <div
                    key={line.label}
                    className="flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="font-medium text-ink-body text-sm">
                        {line.label}
                      </p>
                      <p className="mt-0.5 text-ink-subtle text-xs">
                        {line.note}
                      </p>
                    </div>
                    <span
                      className="shrink-0 font-bold text-base tabular-nums"
                      style={{ color: RED }}
                    >
                      {line.value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between border-white/10 border-t pt-4">
                <span className="font-semibold text-ink-strong text-sm">
                  Total cost
                </span>
                <span className="font-bold text-lg" style={{ color: RED }}>
                  ${x402Total.toLocaleString()} USDC
                </span>
              </div>
            </div>
          </div>

          {/* 4Mica */}
          <div
            className="flex flex-col overflow-hidden rounded-2xl"
            style={{ border: `1px solid ${GREEN}38` }}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ background: `${GREEN}12` }}
            >
              <div>
                <p
                  className="font-semibold text-sm uppercase tracking-widest"
                  style={{ color: GREEN }}
                >
                  With 4Mica
                </p>
                <p className="mt-0.5 text-ink-subtle text-xs">
                  credit layer + batch settlement
                </p>
              </div>
              <i
                className="ri-checkbox-circle-line text-xl"
                style={{ color: GREEN }}
              />
            </div>
            <div className="flex flex-1 flex-col px-6 py-5">
              <div className="flex-1 space-y-5">
                {micaLines.map((line) => (
                  <div
                    key={line.label}
                    className="flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="font-medium text-ink-body text-sm">
                        {line.label}
                      </p>
                      <p className="mt-0.5 text-ink-subtle text-xs">
                        {line.note}
                      </p>
                    </div>
                    <span
                      className="shrink-0 font-bold text-base tabular-nums"
                      style={{ color: GREEN }}
                    >
                      {line.value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between border-white/10 border-t pt-4">
                <span className="font-semibold text-ink-strong text-sm">
                  Net cost
                </span>
                <span className="font-bold text-lg" style={{ color: GREEN }}>
                  ${micaNet.toLocaleString()} USDC
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Delta */}
        <div className="glass-panel mx-auto mt-6 flex max-w-4xl flex-col items-center justify-between gap-4 rounded-2xl px-8 py-5 sm:flex-row">
          <p className="text-ink-muted text-sm">
            Same 1M calls. Same starting capital.
          </p>
          <p className="whitespace-nowrap font-bold text-ink-strong text-lg">
            <span style={{ color: GREEN }}>
              ${netDelta.toLocaleString()} saved
            </span>
            <span className="mx-2 text-ink-subtle">·</span>
            <span style={{ color: GREEN }}>
              {SCENARIO.x402LatencyHours - SCENARIO.micaLatencyHours} hours
              reclaimed
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
