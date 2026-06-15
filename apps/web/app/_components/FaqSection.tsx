"use client";

import { FAQS } from "../data";
export default function FaqSection() {
  return (
    <section id="faq" className="section-gloss py-24">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <p className="section-kicker">FAQ</p>
          <h2 className="section-title">Common questions</h2>
        </div>

        <div className="mx-auto max-w-3xl space-y-3">
          {FAQS.map((faq) => (
            <details
              key={faq.question}
              className="glass-panel group rounded-xl"
            >
              <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-ink-strong text-sm">
                <span>{faq.question}</span>
                <i className="ri-add-line shrink-0 text-ink-subtle group-open:hidden" />
                <i className="ri-subtract-line hidden shrink-0 text-ink-subtle group-open:block" />
              </summary>
              <div className="px-5 pb-4">
                <p className="text-ink-muted text-sm leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
