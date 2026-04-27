'use client';

const USE_CASES = [
  {
    icon: 'ri-robot-line',
    kicker: 'AI Agents',
    title: 'Autonomous agent subscriptions',
    desc: 'An AI agent calls dozens of APIs per task — data feeds, inference endpoints, storage. 4Mica lets it pay on credit from one pool and settle net exposure once per epoch.',
    tags: ['Off-chain execution', 'Per-request payment', 'Auto-settlement'],
    color: '#7bcbff',
  },
  {
    icon: 'ri-exchange-line',
    kicker: 'Agentic Commerce',
    title: 'Agent-to-agent micropayments',
    desc: 'When agents transact with each other at high frequency, on-chain settlement per call is unworkable. 4Mica natively nets bilateral flows and collapses them into one settlement.',
    tags: ['Agent-to-agent', 'Bilateral netting', 'High-frequency'],
    color: '#c084fc',
  },
  {
    icon: 'ri-code-box-line',
    kicker: 'APIs / Pay-per-request',
    title: 'HTTP API monetization at scale',
    desc: 'Charge per API call using standard x402 headers — no SDK required on the client side. Works with existing HTTP clients. Add 4Mica middleware to enable credit and batch settlement.',
    tags: ['x402-compatible', 'Any HTTP client', 'Instant verification'],
    color: '#4ade80',
  },
  {
    icon: 'ri-bank-line',
    kicker: 'Financial Infrastructure',
    title: 'Clearinghouse for on-chain apps',
    desc: 'Build a payment rail that aggregates millions of micro-transfers, earns yield on float, and settles net positions on-chain. The same primitive banks use — but permissionless.',
    tags: ['Yield on float', 'Programmable disputes', 'Non-custodial'],
    color: '#f59e0b',
  },
];

export default function UseCasesSection() {
  return (
    <section id="use-cases" className="py-24 section-gloss">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <p className="section-kicker">Use cases</p>
          <h2 className="section-title">Built for the scale you need</h2>
          <p className="section-lead max-w-xl mx-auto">
            From autonomous agents to financial infrastructure — 4Mica handles the payment layer so you don&apos;t have to.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl mx-auto">
          {USE_CASES.map((uc) => (
            <div
              key={uc.title}
              className="glass-panel rounded-2xl p-6 sm:p-7 flex flex-col gap-4"
              style={{ borderColor: uc.color + '18' }}
            >
              <div className="flex items-start justify-between">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: uc.color + '15' }}
                >
                  <i className={`${uc.icon} text-lg`} style={{ color: uc.color }} />
                </div>
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: uc.color + 'aa' }}
                >
                  {uc.kicker}
                </span>
              </div>

              <div>
                <h3 className="text-base font-semibold text-ink-strong">{uc.title}</h3>
                <p className="mt-2 text-sm text-ink-muted leading-relaxed">{uc.desc}</p>
              </div>

              <div className="flex flex-wrap gap-2 mt-auto pt-2">
                {uc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background: uc.color + '12',
                      color: uc.color + 'cc',
                      border: `1px solid ${uc.color}25`,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
