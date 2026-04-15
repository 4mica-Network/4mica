'use client';

export default function SecuritySection() {
  const items = [
    'Non-custodial collateral stays in Aave until withdrawal or on-chain claim',
    'Guarantees are BLS-signed with domain separation and versioned configs',
    'AccessManaged roles, Pausable, and ReentrancyGuard protect critical flows',
  ];

  return (
    <section id="security" className="py-20 section-gloss">
      <div className="container mx-auto px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center max-w-6xl mx-auto">
          <div>
            <p className="section-kicker">Security model</p>
            <h2 className="section-title">
              Plain UX, hard guarantees
            </h2>
            <p className="section-lead">
              Credit lines are secured by BLS-signed certificates. Because collateral stays in Aave, users can withdraw at any time and recipients can claim on-chain if a payer defaults — no intermediary required.
            </p>
          </div>
          <div className="glass-panel rounded-2xl p-6 sm:p-8">
            <ul className="space-y-4">
              {items.map((item) => (
                <li key={item} className="flex items-start gap-3 text-ink-body">
                  <span className="mt-2 h-2 w-2 rounded-full bg-brand" />
                  <span className="text-sm leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
