'use client';

import Image from 'next/image';
import Link from 'next/link';

export default function PartnersSection() {
  const partners = [
    { name: 'Aligned Layer', logo: '/assets/aligned_layer_logo.png', href: 'https://alignedlayer.com/' },
    { name: 'ChaosChain', logo: '/assets/chaos_chain_logo.svg', href: 'https://chaoscha.in/' }
  ];
  const proofPoints = [
    {
      title: 'Open-source core',
      description: 'Contracts and SDKs are public on GitHub',
    },
    {
      title: 'Testnet live',
      description: '4Mica is live on testnet — deposit, spend, and settle today',
    },
    {
      title: 'Non-custodial',
      description: 'Collateral stays in Aave until withdrawal or on-chain claim',
    },
  ];

  return (
    <section className="py-20 section-gloss">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <p className="section-kicker mb-4">Trusted by</p>
          <h2 className="section-title mb-4">
            Partners that trust 4Mica
          </h2>
          <p className="section-lead max-w-2xl mx-auto">
            Teams running AVS compute, API monetization, and agentic commerce on 4Mica's credit layer
          </p>
        </div>

        <div className="flex flex-wrap justify-center items-center gap-8 mb-12">
          {partners.map((partner, index) => (
            <Link
              key={index}
              href={partner.href}
              target="_blank"
              rel="noreferrer"
              className="glass-panel rounded-lg p-3 flex items-center justify-center transition-all duration-300 border border-white/10 hover:border-brand/40"
              aria-label={`${partner.name} homepage`}
            >
              <Image
                src={partner.logo}
                alt={partner.name}
                width={200}
                height={64}
                className="max-h-16 w-auto object-contain filter grayscale hover:grayscale-0 transition-all duration-300"
              />
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">
          {proofPoints.map((point) => (
            <div key={point.title} className="glass-panel rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-ink-strong">{point.title}</h3>
              <p className="mt-3 text-sm text-ink-body leading-relaxed">{point.description}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Link
            href="/resources/technical-docs"
            className="btn btn-primary btn-lg whitespace-nowrap text-center"
          >
            Start Building
          </Link>
          <Link
            href="https://github.com/4mica-Network/4mica-core/"
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline btn-lg whitespace-nowrap text-center"
          >
            Star us on GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}
