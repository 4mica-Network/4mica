"use client";

export default function HeroSection() {
  return (
    <section className="section-gloss relative">
      <div className="relative z-10 w-full">
        <div className="container mx-auto px-6 pt-32 pb-20 lg:pt-36 lg:pb-24">
          <div className="flex flex-col items-center text-center">
            {/* Headline */}
            <h1 className="section-title-lg max-w-4xl leading-tight">
              The clearing house for
              <br />
              the agentic economy
            </h1>

            {/* Subheadline */}
            <p className="mt-5 max-w-xl text-ink-body/80 text-lg leading-relaxed md:text-xl">
              Infrastructure for your agent to transact on instant programmable
              credit, earn yield, and settle at once.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
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
