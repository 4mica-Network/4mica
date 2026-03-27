'use client';

import Link from 'next/link';

export default function DocsCalloutSection() {
  return (
    <section id="docs" className="py-16 section-gloss">
      <div className="container mx-auto px-6">
        <div className="glass-panel rounded-2xl p-8 sm:p-10 lg:p-12">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <p className="section-kicker">Docs</p>
              <h2 className="mt-4 section-title-sm">
                Start with tabs, ship in a day
              </h2>
              <p className="section-lead">
                Quickstart, SDKs, and API endpoints for /tabs, /verify, /settle, and V2 validation-gated remuneration
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-4">
                <Link
                  href="/resources/technical-docs"
                  className="btn btn-primary btn-md text-center"
                >
                  Start Building
                </Link>
                <Link
                  href="/resources"
                  className="btn btn-soft btn-md text-center"
                >
                  Browse Docs
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-surface-solid p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-brand">
                Minimal flow
              </p>
              <div className="mt-4 space-y-2 text-sm text-ink-body">
                <div className="flex items-center justify-between">
                  <span>Recipient: POST /tabs</span>
                  <span className="text-brand-teal">open tab</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Agent: POST /settle</span>
                  <span className="text-brand-teal">credit guarantee</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>V2: ERC-8004 status</span>
                  <span className="text-brand-teal">job validated</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Agent: payTabInERC20Token</span>
                  <span className="text-brand-teal">T+7 days</span>
                </div>
              </div>
              <p className="mt-4 text-xs text-ink-subtle">
                SDKs: Rust, TypeScript, Python
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
