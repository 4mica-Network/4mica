"use client";

export default function HowItWorksSection() {
  const steps = [
    {
      step: "01",
      title: "Recipient opens a tab",
      description: "Create a tab_id with asset and limits for a user",
    },
    {
      step: "02",
      title: "User spends on credit",
      description: "Users sign guarantees per request with no prefunding",
    },
    {
      step: "03",
      title: "User settles after 7 days",
      description:
        "Settle later, or claim collateral after the on-chain grace period",
    },
  ];

  return (
    <section id="how-it-works" className="section-gloss py-20">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="section-kicker">How it works</p>
          <h2 className="section-title">Three steps to instant spend</h2>
          <p className="section-lead">
            Plain flow first, cryptographic guarantees underneath
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.title} className="glass-panel rounded-2xl p-6">
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
