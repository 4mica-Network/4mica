
'use client';

export default function HeroSection() {
  const handleGetStarted = () => {
    const docsSection = document.querySelector('#docs');
    if (docsSection) {
      docsSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleJoinCommunity = () => {
    const communitySection = document.querySelector('#community');
    if (communitySection) {
      communitySection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const highlights = [
    {
      title: 'Non-custodial collateral',
      description: 'Funds stay on-chain with the user until settlement',
    },
    {
      title: 'BLS-backed guarantees',
      description: 'Cryptographic proofs for each spend request',
    },
    {
      title: 'Settle after 7 days',
      description: 'Users pay later without prefunding balances',
    },
    {
      title: 'ETH, USDC, USDT',
      description: 'Default assets with versioned guarantees',
    },
  ];

  const heroContent = (
    <div className="relative z-10 w-full">
      <div className="container mx-auto px-6 pt-24 pb-24 lg:pt-28 lg:pb-28">
        <div className="grid items-center gap-12 lg:grid-cols-1">
          <div className="flex flex-col items-center text-center">
            <h1 className="mt-6 section-title-lg leading-tight">
              Instant payments on any chain
            </h1>
            <p className="mt-6 text-lg md:text-xl text-ink-body/80 max-w-2xl leading-relaxed">
              Open a tab, let users spend now, then settle after 7 days with non-custodial, collateral-backed guarantees.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={handleGetStarted}
                className="btn btn-outline btn-lg whitespace-nowrap"
              >
                Start Building
              </button>
              <button
                onClick={handleJoinCommunity}
                className="btn btn-outline btn-lg whitespace-nowrap"
              >
                Join Community
              </button>
            </div>
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              {highlights.map((highlight) => (
                <div key={highlight.title} className="glass-panel rounded-xl p-4">
                  <p className="text-sm font-semibold text-ink-strong">{highlight.title}</p>
                  <p className="mt-2 text-xs text-ink-muted leading-relaxed">{highlight.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const scrollIndicator = (
    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col items-center text-ink/60">
      <span className="text-sm mb-2 font-medium">Explore the platform</span>
      <div className="w-6 h-10 border-2 border-brand-teal/60 rounded-full flex justify-center">
        <div className="w-1 h-3 bg-brand-teal rounded-full mt-2 animate-bounce"></div>
      </div>
    </div>
  );

  return (
    <section className="relative min-h-screen section-gloss">
      {heroContent}
      {scrollIndicator}
    </section>
  );
}
