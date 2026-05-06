'use client';

const BLUE = '#7bcbff';

const USE_CASES = [
  {
    icon: 'ri-robot-line',
    kicker: 'AI Agents',
    title: 'Agents pay APIs on credit, settle once',
    desc: 'An AI agent calls dozens of endpoints per task: data feeds, inference, storage. No account setup, no API keys. It pays on credit from one pool and settles net exposure once per epoch.',
    tags: ['No account setup', 'Instant onboarding', 'Auto-settlement'],
  },
  {
    icon: 'ri-exchange-line',
    kicker: 'Agentic Commerce',
    title: 'Agent-to-agent micropayments at scale',
    desc: 'When agents transact with each other at high frequency, on-chain settlement per call is unworkable. 4Mica natively nets bilateral flows and collapses them into one settlement.',
    tags: ['Agent-to-agent', 'Bilateral netting', 'High-frequency'],
  },
  {
    icon: 'ri-code-box-line',
    kicker: 'API Monetization',
    title: 'Accept payments with one line of code',
    desc: 'Add 4Mica middleware and charge per HTTP request. Works with any x402-compatible client. No SDK on the client side, no KYC, no credits to manage. Money moves at the speed of the internet.',
    tags: ['x402-compatible', 'Any HTTP client', 'Zero friction'],
  },
  {
    icon: 'ri-bank-line',
    kicker: 'Financial Infrastructure',
    title: 'Clearinghouse for on-chain apps',
    desc: 'Build a payment rail that aggregates millions of micro-transfers, earns yield on float, and settles net positions on-chain. The same primitive that banks use, but permissionless.',
    tags: ['Yield on float', 'Programmable disputes', 'Non-custodial'],
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
            API monetization, agentic commerce, paywalled content. 4Mica handles the payment layer so you don&apos;t have to.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl mx-auto">
          {USE_CASES.map((uc) => (
            <div
              key={uc.title}
              className="glass-panel rounded-2xl p-6 sm:p-7 flex flex-col gap-4"
              style={{ borderColor: BLUE + '28' }}
            >
              <div className="flex items-start justify-between">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: BLUE + '1a' }}
                >
                  <i className={`${uc.icon} text-lg`} style={{ color: BLUE }} />
                </div>
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: BLUE + 'bb' }}
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
                      background: BLUE + '14',
                      color: BLUE + 'cc',
                      border: `1px solid ${BLUE}30`,
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
