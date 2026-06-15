"use client";

import { steps } from "./data";
export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="section-gloss py-20">
      <div className="w-full">
        <div className="mx-auto max-w-3xl text-center">
          <p className="section-kicker">How it works</p>
          <h2 className="section-title">Three steps to instant spend</h2>
          <p className="section-lead">
            Plain flow first, cryptographic guarantees underneath
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.title} className="glass-panel rounded-md p-6">
              <div className="font-semibold text-brand text-sm">
                {step.step}
              </div>
              <h3 className="mt-4 font-semibold text-ink-strong text-xl">
                {step.title}
              </h3>
              <p className="mt-3 text-ink-body text-sm leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
