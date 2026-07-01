"use client";

import { messages } from "@/i18n";
import { benefits } from "./data";
export default function BenefitsSection() {
  return (
    <section id="benefits" className="section-gloss py-20">
      <div className="w-full">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="section-kicker">
              {messages.sharedContent.sections.benefits.kicker}
            </p>
            <h2 className="section-title">
              {messages.sharedContent.sections.benefits.title}
            </h2>
            <p className="section-lead">
              {messages.sharedContent.sections.benefits.lead}
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
                  <span className="text-md leading-relaxed">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
