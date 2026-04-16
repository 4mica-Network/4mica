
'use client';

export default function HeroSection() {
  const handleGetStarted = () => {
    const docsSection = document.querySelector('#docs');
    if (docsSection) {
      docsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

const highlights = [
    {
      title: 'Earn while agents spend',
      description: 'Deposits generate yield that offsets costs',
    },
    {
      title: 'One pool, infinite endpoints',
      description: 'No per-channel collateral or prefunding',
    },
    {
      title: 'Settle Less, Clear More',
      description: 'Built-in credit with cryptographic guarantees',
    },
    {
      title: 'Gasless, cross-chain', // CHANGED: "and" → ","
      description: 'Works across x402, MPP, and more',
    },
  ];

  const heroContent = (
    <div className="relative z-10 w-full">
      <div className="container mx-auto px-6 pt-16 pb-24 lg:pt-20 lg:pb-28"> {/* CHANGED: pt-24→pt-16, lg:pt-28→lg:pt-20 — move content block upward */}
        <div className="grid items-center gap-12 lg:grid-cols-1">
          <div className="flex flex-col items-center text-center">
            <h1 className="section-title-lg leading-tight w-full">The Clearing Layer for<br />the Agentic Economy</h1>
            <p className="mt-3 text-lg md:text-xl text-ink-body/80 leading-relaxed max-w-lg">
              Power AI agents with credit via x402—while your capital continuously earns yield.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
              <a
                href="/resources/technical-docs"
                className="btn btn-primary btn-lg whitespace-nowrap font-bold"
              >
                Documentation
              </a>
              <button
                onClick={handleGetStarted}
                className="btn btn-outline btn-lg whitespace-nowrap font-normal"
              >
                See How It Works
              </button>
            </div>
            <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl"> {/* CHANGED: mt-10→mt-14 — more breathing room between buttons and cards */}
              {highlights.map((highlight) => (
                <div key={highlight.title} className="glass-panel rounded-xl p-4 border border-white/10 bg-white/5"> {/* CHANGED: removed opacity-90, added border-white/10 + bg-white/5 for more visibility against dark bg */}
                  <p className="text-sm font-semibold text-ink-strong/90">{highlight.title}</p> {/* CHANGED: text-ink-strong→text-ink-strong/90 keeps contrast visible */}
                  <p className="mt-2 text-xs text-ink-muted/80 leading-relaxed">{highlight.description}</p> {/* CHANGED: text-ink-muted→text-ink-muted/80 — slightly higher contrast */}
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
