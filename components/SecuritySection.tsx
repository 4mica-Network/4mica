'use client';

const SECURITY_POINTS = [
  {
    icon: 'ri-safe-line',
    label: 'Collateral stays in Aave',
    desc: 'Deposits go directly to Aave — not to 4Mica. Users can withdraw at any time. 4Mica never holds funds.',
    color: 'rgb(74 222 128)',
  },
  {
    icon: 'ri-fingerprint-line',
    label: 'BLS-signed guarantees',
    desc: 'Every payment is backed by an EIP-712 signed guarantee with domain separation. Cryptographic proof exists for every spend.',
    color: 'rgb(var(--brand))',
  },
  {
    icon: 'ri-shield-check-line',
    label: 'On-chain enforcement',
    desc: 'If a payer defaults, recipients claim collateral directly from the contract. No trusted intermediary. No custodian risk.',
    color: '#c084fc',
  },
  {
    icon: 'ri-git-branch-line',
    label: 'AccessManaged + Pausable',
    desc: 'Role-based access control, emergency pause, and reentrancy guards on all critical contract flows.',
    color: 'rgb(var(--color-warning))',
  },
];

export default function SecuritySection() {
  return (
    <section id="security" className="py-24 section-gloss">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">

          <div className="grid lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-16 items-start">

            {/* Left — copy */}
            <div>
              <p className="section-kicker">Security</p>
              <h2 className="section-title">Plain UX, hard guarantees</h2>
              <p className="section-lead">
                The protocol is designed so that trust is enforced by math and contracts — not by 4Mica.
              </p>
              <div className="mt-6 glass-panel rounded-xl px-5 py-4" style={{ borderColor: 'rgb(74 222 128 / 0.2)' }}>
                <p className="text-sm font-semibold text-ink-strong">Non-custodial by design</p>
                <p className="mt-1.5 text-xs text-ink-muted leading-relaxed">
                  Your collateral is in Aave. Your guarantees are on-chain. 4Mica is the coordination layer — it cannot move your funds.
                </p>
              </div>
            </div>

            {/* Right — bullet list */}
            <div className="space-y-4">
              {SECURITY_POINTS.map((pt) => (
                <div
                  key={pt.label}
                  className="glass-panel rounded-xl px-5 py-4 flex items-start gap-4"
                  style={{ borderColor: pt.color + '20' }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: pt.color + '15' }}
                  >
                    <i className={`${pt.icon} text-sm`} style={{ color: pt.color }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink-strong">{pt.label}</p>
                    <p className="mt-1 text-xs text-ink-muted leading-relaxed">{pt.desc}</p>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
