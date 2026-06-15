"use client";

import { benefits } from "./data";
export default function BenefitsSection() {
  return (
    <section id="benefits" className="section-gloss py-20">
      <div className="w-full">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="section-kicker">Benefits</p>
            <h2 className="section-title">
              Built for developers who ship fast
            </h2>
            <p className="section-lead">
              Start with plain UX. Add verifiable credit guarantees when you are
              ready.
            </p>
          </div>
          <div className="glass-panel rounded-md p-6 sm:p-8">
            <ul className="space-y-4">
              {benefits.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-3 text-ink-body"
                >
                  <span className="mt-2 h-2 w-2 rounded-md bg-brand-teal" />
                  <span className="text-sm leading-relaxed">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
