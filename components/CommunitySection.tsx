'use client';

import Link from 'next/link';

const githubUrl = 'https://github.com/4mica-Network/4mica-core/';

export default function CommunitySection() {
  const hooks = [
    {
      label: 'Star on GitHub',
      href: githubUrl,
    },
    {
      label: 'Build with us',
      href: githubUrl,
    },
    {
      label: 'Request early access',
      href: 'mailto:mairon@4mica.xyz?subject=Early%20Access%20Request&body=Hi%204Mica%20team,%20I%20would%20like%20early%20access.',
    },
  ];

  return (
    <section id="community" className="py-20 section-gloss">
      <div className="container mx-auto px-6">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center max-w-6xl mx-auto">
          <div>
            <p className="section-kicker">Community</p>
            <h2 className="section-title">
              Build the payment tab standard
            </h2>
            <p className="section-lead">
              We are building in public with developers who ship infra. Join the discussion, open issues, and help shape the
              protocol.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
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
                className="glass-panel rounded-2xl px-5 py-4 text-sm font-semibold text-ink-strong hover:text-ink transition-colors"
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
