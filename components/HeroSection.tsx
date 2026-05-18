'use client';

export default function HeroSection() {
  return (
    <section className="relative section-gloss">
      <div className="relative z-10 w-full">
        <div className="container mx-auto px-6 pt-32 pb-20 lg:pt-36 lg:pb-24">
          <div className="flex flex-col items-center text-center">

            {/* Headline */}
            <h1 className="section-title-lg leading-tight max-w-4xl">
              The clearing house for<br />the agentic economy
            </h1>

            {/* Subheadline */}
            <p className="mt-5 text-lg md:text-xl text-ink-body/80 leading-relaxed max-w-xl">
              Infrastructure for your agent to transact on instant programmable credit, earn yield, and settle at once.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
              <a
                href="/resources/technical-docs"
                className="btn btn-primary btn-lg whitespace-nowrap font-bold"
              >
                Start Building
              </a>
              <a
                href="#how-it-works"
                className="btn btn-outline btn-lg whitespace-nowrap"
              >
                See How It Works
              </a>
            </div>


          </div>
        </div>
      </div>

    </section>
  );
}
