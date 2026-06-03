"use client";

import Link from "next/link";

const githubUrl = "https://github.com/4mica-Network/4mica-core/";

export default function CommunitySection() {
  const hooks = [
    {
      label: "Star on GitHub",
      href: githubUrl,
    },
    {
      label: "Build with us",
      href: githubUrl,
    },
    {
      label: "Request early access",
      href: "mailto:mairon@4mica.xyz?subject=Early%20Access%20Request&body=Hi%204Mica%20team,%20I%20would%20like%20early%20access.",
    },
  ];

  return (
    <section id="community" className="section-gloss py-20">
      <div className="container mx-auto px-6">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="section-kicker">Community</p>
            <h2 className="section-title">Build the payment tab standard</h2>
            <p className="section-lead">
              We are building in public with developers who ship infra. Join the
              discussion, open issues, and help shape the protocol.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href={githubUrl}
                className="btn btn-primary btn-md text-center"
              >
                Join Community
              </Link>
              <Link
                href="/resources/technical-docs"
                className="btn btn-soft btn-md text-center"
              >
                Start Building
              </Link>
            </div>
          </div>
          <div className="grid gap-4">
            {hooks.map((hook) => (
              <Link
                key={hook.label}
                href={hook.href}
                className="glass-panel rounded-2xl px-5 py-4 font-semibold text-ink-strong text-sm transition-colors hover:text-ink"
              >
                {hook.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
