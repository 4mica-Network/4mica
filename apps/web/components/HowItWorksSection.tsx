"use client";

import { messages } from "@/i18n";
import { steps } from "./data";
export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="section-gloss py-20">
      <div className="w-full">
        <div className="mx-auto max-w-3xl text-center">
          <p className="section-kicker">
            {messages.sharedContent.sections.howItWorks.kicker}
          </p>
          <h2 className="section-title">
            {messages.sharedContent.sections.howItWorks.title}
          </h2>
          <p className="section-lead">
            {messages.sharedContent.sections.howItWorks.lead}
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.title} className="glass-panel rounded-md p-6">
              <div className="font-semibold text-brand text-md">
                {step.step}
              </div>
              <h3 className="mt-4 font-semibold text-ink-strong text-xl">
                {step.title}
              </h3>
              <p className="mt-3 text-ink-body text-md leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
