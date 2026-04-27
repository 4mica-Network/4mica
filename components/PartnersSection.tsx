'use client';

import Image from 'next/image';
import Link from 'next/link';

const PRIMITIVES = [
  {
    name: 'x402',
    role: 'Payment protocol',
    desc: 'The HTTP payment standard 4Mica extends with a credit layer. Any x402-compatible client works out of the box.',
    color: '#7bcbff',
    icon: 'ri-global-line',
  },
  {
    name: 'Aave',
    role: 'Yield layer',
    desc: 'All collateral routes directly to Aave. Deposits earn APY continuously — your payment infrastructure generates return.',
    color: '#4ade80',
    icon: 'ri-plant-line',
  },
  {
    name: 'Ethereum / Base',
    role: 'Settlement layer',
    desc: 'Net positions settle on-chain via EVM-compatible contracts. One transaction per settlement window, cryptographically enforced.',
    color: '#c084fc',
    icon: 'ri-links-line',
  },
];

const PARTNERS = [
  { name: 'Aligned Layer', logo: '/assets/aligned_layer_logo.png', href: 'https://alignedlayer.com/' },
  { name: 'ChaosChain', logo: '/assets/chaos_chain_logo.svg', href: 'https://chaoscha.in/' },
  { name: 'Wachai', logo: '/assets/wachai.png', href: 'https://wach.ai/' },
];

const TRUST_POINTS = [
  { icon: 'ri-lock-line', label: 'Non-custodial', desc: 'You own your collateral. 4Mica never holds funds.' },
  { icon: 'ri-code-s-slash-line', label: 'Open-source core', desc: 'Contracts and SDKs are public on GitHub.' },
  { icon: 'ri-test-tube-line', label: 'Testnet live', desc: 'Deposit, spend, and earn on Sepolia today.' },
];

export default function PartnersSection() {
  return (
    <section className="py-24 section-gloss">
      <div className="container mx-auto px-6">

        {/* Ecosystem primitives */}
        <div className="text-center mb-12">
          <p className="section-kicker">Ecosystem</p>
          <h2 className="section-title">Built on primitives you already trust</h2>
          <p className="section-lead max-w-xl mx-auto">
            4Mica is not a new protocol stack. It is a credit layer on top of production infrastructure.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto mb-16">
          {PRIMITIVES.map((p) => (
            <div
              key={p.name}
              className="glass-panel rounded-2xl p-6 flex flex-col gap-3"
              style={{ borderColor: p.color + '20' }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: p.color + '15' }}
              >
                <i className={`${p.icon} text-lg`} style={{ color: p.color }} />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-ink-strong">{p.name}</span>
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: p.color + 'aa' }}>
                    {p.role}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-ink-muted leading-relaxed">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-white/5 mb-16" />

        {/* Trust points */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto mb-16">
          {TRUST_POINTS.map((t) => (
            <div key={t.label} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: 'rgb(var(--brand) / 0.1)' }}>
                <i className={`${t.icon} text-sm`} style={{ color: 'rgb(var(--brand))' }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-strong">{t.label}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Partner logos */}
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-widest text-ink-subtle mb-6">Teams building on 4Mica</p>
          <div className="flex flex-wrap justify-center items-center gap-6">
            {PARTNERS.map((partner) => (
              <Link
                key={partner.name}
                href={partner.href}
                target="_blank"
                rel="noreferrer"
                className="glass-panel rounded-xl p-3 flex items-center justify-center transition-all duration-300 hover:border-brand/30"
                aria-label={`${partner.name} homepage`}
              >
                <Image
                  src={partner.logo}
                  alt={partner.name}
                  width={160}
                  height={48}
                  className="max-h-12 w-auto object-contain filter grayscale hover:grayscale-0 transition-all duration-300"
                />
              </Link>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 mt-10">
          <Link href="/resources/technical-docs" className="btn btn-primary btn-lg text-center">
            Start Building
          </Link>
          <Link
            href="https://github.com/4mica-Network/4mica-core/"
            target="_blank"
            rel="noreferrer"
            className="btn btn-soft btn-lg text-center"
          >
            <i className="ri-github-fill" />
            View on GitHub
          </Link>
        </div>

      </div>
    </section>
  );
}
