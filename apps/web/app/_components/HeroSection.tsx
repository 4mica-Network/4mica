"use client";

import { links } from "@4mica/url";

export default function HeroSection() {
  return (
    <section className="section-gloss relative">
      <div className="relative z-10 w-full">
        <div className="w-full pt-32 pb-20 lg:pt-36 lg:pb-24">
          <div className="flex flex-col items-center text-center">
            {/* Headline */}
            <h1 className="mt-4 max-w-5xl font-normal text-5xl text-ink-strong leading-tight tracking-[0.01em] md:text-7xl lg:text-[5.5rem]">
              The clearing house for
              <br />
              the agentic economy
            </h1>

            {/* Subheadline */}
            <p className="mt-5 max-w-xl text-ink-body/80 text-lg leading-relaxed md:text-xl">
              4Mica gives agents one place to pay on credit, earn yield, and
              settle transactions without clearing every request on-chain.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="/pricing"
                className="btn btn-primary btn-lg btn-no-lift hero-cta-primary whitespace-nowrap font-semibold"
              >
                <span>Start building</span>
              </a>
              <a
                href="#how-it-works"
                className="hero-cta-ghost inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-white/15 bg-white/5 px-5 py-2.5 font-semibold text-ink-strong text-md leading-none backdrop-blur-sm transition-colors duration-200 ease-out hover:text-[#151515]"
              >
                <i className="ri-play-fill relative z-10 text-lg leading-none" />
                <span className="relative z-10">See how it works</span>
              </a>
            </div>

            <p className="mt-12 font-light text-ink-muted text-md">
              Supported on{" "}
              <a
                href={links.api.base}
                className="font-semibold text-ink-body transition-colors hover:text-ink-strong"
              >
                Base
              </a>
              ,{" "}
              <a
                href={links.api.ethereumSepolia}
                className="font-semibold text-ink-body transition-colors hover:text-ink-strong"
              >
                Ethereum Sepolia
              </a>
              , and{" "}
              <a
                href={links.api.baseSepolia}
                className="font-semibold text-ink-body transition-colors hover:text-ink-strong"
              >
                Base Sepolia
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
