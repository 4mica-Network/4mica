"use client";

const SECURITY_POINTS = [
  {
    icon: "ri-safe-line",
    label: "Collateral stays in Aave",
    desc: "Deposits go directly to Aave, not to 4Mica. Users can withdraw at any time. 4Mica never holds funds.",
    color: "rgb(74 222 128)",
  },
  {
    icon: "ri-fingerprint-line",
    label: "BLS-signed guarantees",
    desc: "Every payment is backed by an EIP-712 signed guarantee with domain separation. Cryptographic proof exists for every spend.",
    color: "rgb(var(--brand))",
  },
  {
    icon: "ri-shield-check-line",
    label: "On-chain enforcement",
    desc: "If a payer defaults, recipients claim collateral directly from the contract. No trusted intermediary. No custodian risk.",
    color: "#c084fc",
  },
  {
    icon: "ri-git-branch-line",
    label: "AccessManaged + Pausable",
    desc: "Role-based access control, emergency pause, and reentrancy guards on all critical contract flows.",
    color: "rgb(var(--color-warning))",
  },
];

export default function SecuritySection() {
  return (
    <section id="security" className="section-gloss py-24">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-4xl">
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            {/* Left */}
            <div>
              <p className="section-kicker">Security</p>
              <h2 className="section-title">Plain UX, hard guarantees</h2>
              <p className="section-lead">
                The protocol is designed so that trust is enforced by math and
                contracts, not by 4Mica.
              </p>
              <div
                className="glass-panel mt-6 rounded-xl px-5 py-4"
                style={{ borderColor: "rgb(74 222 128 / 0.28)" }}
              >
                <p className="font-semibold text-ink-strong text-sm">
                  Non-custodial by design
                </p>
                <p className="mt-1.5 text-ink-muted text-xs leading-relaxed">
                  Your collateral is in Aave. Your guarantees are on-chain.
                  4Mica is the coordination layer. It cannot move your funds.
                </p>
              </div>
            </div>

            {/* Right */}
            <div className="space-y-4">
              {SECURITY_POINTS.map((pt) => (
                <div
                  key={pt.label}
                  className="glass-panel flex items-start gap-4 rounded-xl px-5 py-4"
                  style={{ borderColor: `${pt.color}32` }}
                >
                  <div
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `${pt.color}22` }}
                  >
                    <i
                      className={`${pt.icon} text-sm`}
                      style={{ color: pt.color }}
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-ink-strong text-sm">
                      {pt.label}
                    </p>
                    <p className="mt-1 text-ink-muted text-xs leading-relaxed">
                      {pt.desc}
                    </p>
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
