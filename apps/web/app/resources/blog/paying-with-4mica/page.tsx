import type { Metadata } from "next";
import Link from "next/link";
import CodeTabs from "../CodeTabs";
import { sections } from "./data";

export const metadata: Metadata = {
  title: "Paying with 4Mica",
  description:
    "A payer-first guide to funding collateral, signing 4Mica payment headers, and settling tabs on-chain with v2 validation-gated guarantees.",
};

export default function PayingWith4MicaPage() {
  return (
    <div className="min-h-screen pt-20 pb-24 text-ink-body">
      <div className="container mx-auto max-w-4xl px-6">
        <header className="mb-12 text-center">
          <p className="section-kicker">Payer Guide</p>
          <h1 className="section-title mb-4">
            Paying with 4Mica: Credit, Tabs, and Settlement
          </h1>
          <p className="text-ink-muted text-sm">
            Published January 29, 2026 · 10 min read · By Mairon
          </p>
        </header>

        <article className="glass-panel space-y-10 rounded-2xl p-8">
          {sections.map((section) => (
            <section key={section.heading} className="space-y-4">
              <h2 className="font-bold text-2xl text-ink-strong">
                {section.heading}
              </h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="text-ink-body leading-relaxed">
                  {paragraph}
                </p>
              ))}

              {section.steps && (
                <ol className="list-inside list-decimal space-y-2 text-ink-body">
                  {section.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}

              {section.bullets && (
                <ul className="list-inside list-disc space-y-2 text-ink-body">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}

              {section.codeBlocks && <CodeTabs blocks={section.codeBlocks} />}
            </section>
          ))}
        </article>

        <footer className="mt-12 flex flex-col items-center justify-between gap-4 text-ink-muted text-sm md:flex-row">
          <Link
            href="/resources/blog"
            className="link-accent cursor-pointer whitespace-nowrap"
          >
            ← Back to Blog
          </Link>
          <span>Last updated: January 29, 2026</span>
        </footer>
      </div>
    </div>
  );
}
