"use client";

import Link from "next/link";

export default function AboutSection() {
  const aboutCards = [
    {
      title: "4Mica Mission",
      description:
        "Mission, product focus, and how 4Mica unlocks credit-backed payments",
      href: "/about",
    },
    {
      title: "Team",
      description:
        "Meet the founders building the payment layer for instant commerce",
      href: "/leadership",
    },
    {
      title: "Roadmap",
      description:
        "Track delivery milestones for the credit layer and network rollout",
      href: "/roadmap",
    },
  ];

  return (
    <section id="about" className="section-gloss py-24">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="section-kicker">About Us</p>
          <h2 className="section-title">
            The credit layer for instant, on-chain commerce
          </h2>
          <p className="section-lead">
            4Mica issues cryptographic payment tabs that keep capital productive
            while delivering real-time UX. We help teams monetize APIs and
            on-chain commerce without forcing users to pre-fund every request.
          </p>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {aboutCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="glass-panel rounded-2xl p-6 transition-all duration-300 hover:-translate-y-0.5"
            >
              <h3 className="font-semibold text-ink-strong text-xl">
                {card.title}
              </h3>
              <p className="mt-3 text-ink-body text-sm leading-relaxed">
                {card.description}
              </p>
              <span className="link-accent mt-4 inline-flex items-center font-semibold text-sm">
                Learn more
                <i className="ri-arrow-right-line ml-2 text-base"></i>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
