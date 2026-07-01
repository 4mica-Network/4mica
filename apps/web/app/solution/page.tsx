import Footer from "@components/Footer";
import Header from "@components/Header";
import { SOLUTION_META_DATA } from "@seo/solution";
import Image from "next/image";

export const metadata = SOLUTION_META_DATA;

function ShinyHoverBorder({
  radiusClass = "rounded-md",
}: {
  radiusClass?: string;
}) {
  return (
    <>
      <div
        className={`pointer-events-none absolute inset-0 z-20 border border-overlay/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${radiusClass}`}
      />
      <div
        className={`pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${radiusClass}`}
        style={{
          padding: "1px",
          background:
            "linear-gradient(115deg, rgba(255,255,255,0), rgba(255,255,255,0.36), rgba(255,255,255,0.04), rgba(255,255,255,0))",
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
        }}
      />
    </>
  );
}

const PROBLEM_POINTS = [
  "Centralized trust",
  "Fragmented liquidity",
  "Locked capital (capital inefficiency)",
  "UX & regulatory friction",
];

const SOLUTION_FEATURES = [
  {
    title: "Line of credit",
    icon: "ri-bank-card-line",
    desc: "Enables cryptographically-backed lines of credit.",
  },
  {
    title: "Instant payments",
    icon: "ri-flashlight-line",
    desc: "One yield-generating deposit backs thousands of instant micro-payments.",
  },
  {
    title: "Configurable SLAs",
    icon: "ri-settings-3-line",
    desc: "Configurable TTLs and SLAs, for full flexibility.",
  },
  {
    title: "Trustless settlement",
    icon: "ri-shield-check-line",
    desc: "Settlement automatically enforced on the parent chain — no value leakage.",
  },
  {
    title: "Flexible integration",
    icon: "ri-puzzle-line",
    desc: "Composable across any service that accepts crypto.",
  },
  {
    title: "Multi-platform support",
    icon: "ri-links-line",
    desc: "Payment infrastructure for APIs, agents, and on-chain services.",
  },
];

const ARCHITECTURE_STEPS = [
  {
    title: "Collateral",
    icon: "ri-safe-line",
    desc: "Deposit into a yield-generating vault.",
  },
  {
    title: "Line of credit",
    icon: "ri-bank-card-line",
    desc: "Instant access to the service.",
  },
  {
    title: "Instant value-exchange",
    icon: "ri-flashlight-line",
    desc: "Cryptographic payment tabs.",
  },
  {
    title: "Settlement on L1",
    icon: "ri-shield-check-line",
    desc: "Secure and trustless by design.",
  },
];

const CONFIG_CARDS = [
  {
    title: "Configurable TTL",
    icon: "ri-time-line",
    desc: "Time-to-live settings.",
  },
  {
    title: "Collateral ratio",
    icon: "ri-percent-line",
    desc: "Built-in risk management.",
  },
  {
    title: "Configurable SLA",
    icon: "ri-shield-line",
    desc: "Tunable service agreements.",
  },
];

export default function SolutionPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-36 pb-20">
        <section className="w-full">
          {/* Header */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker">Solution</p>
            <h1 className="section-title text-balance font-normal">
              Credit-backed, capital-efficient, and instant payments for any
              service — web3 or traditional.
            </h1>
          </div>

          {/* Problem + Case study — one connected block */}
          <div className="mt-14 overflow-hidden rounded-md border border-overlay/10">
            <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-overlay/10">
              {/* Problem */}
              <div className="group relative border-overlay/10 border-b bg-surface p-8 transition-colors duration-500 hover:bg-surface-solid sm:p-10 lg:border-b-0">
                <ShinyHoverBorder radiusClass="rounded-none" />
                <div className="relative z-10">
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-overlay/10 bg-overlay/5 px-3 py-1 text-md text-red-300 uppercase tracking-widest">
                    <i className="ri-error-warning-line" />
                    Problem
                  </div>
                  <p className="text-ink-body text-lg leading-relaxed">
                    Any service deployed on web3 rails lacks a
                    capital-efficient, cheap, and non-custodial way to pay in
                    real time.
                  </p>
                  <p className="mt-6 font-semibold text-ink-strong">
                    Current workarounds lead to:
                  </p>
                  <ul className="mt-3 space-y-3">
                    {PROBLEM_POINTS.map((point) => (
                      <li
                        key={point}
                        className="flex items-center gap-3 text-ink-muted"
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-6 text-ink-body leading-relaxed">
                    The result: per-task billing is nearly impossible at scale —
                    slowing adoption.
                  </p>
                </div>
              </div>

              {/* Case study */}
              <div className="group relative bg-surface p-8 transition-colors duration-500 hover:bg-surface-solid sm:p-10">
                <ShinyHoverBorder radiusClass="rounded-none" />
                <div className="relative z-10">
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-overlay/10 bg-overlay/5 px-3 py-1 text-ink-muted text-md uppercase tracking-widest">
                    <i className="ri-lightbulb-line text-ink-strong" />
                    Case study · API monetization
                  </div>
                  <Image
                    src="/assets/aligned_layer_logo.png"
                    alt="Aligned Layer"
                    width={320}
                    height={120}
                    className="mb-6 h-12 w-auto object-contain opacity-90"
                  />
                  <ul className="space-y-4 text-ink-muted text-lg">
                    <li className="flex items-start gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-overlay/40" />
                      Aligned offers ultra-cheap verification costs.
                    </li>
                    <li className="flex flex-wrap items-baseline gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 self-center rounded-full bg-overlay/40" />
                      Aligned cost{" "}
                      <span className="font-bold text-ink-strong text-xl">
                        $0.019
                      </span>{" "}
                      vs payment gas fee{" "}
                      <span className="font-bold text-red-400 text-xl">
                        $0.14
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-overlay/40" />
                      Gas fees are 8× higher than the service cost.
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-overlay/40" />
                      Payment limitations prevent scaling.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* The 4Mica solution */}
          <div className="mt-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="section-kicker">How it works</p>
              <h2 className="section-title font-normal">The 4Mica solution</h2>
            </div>

            <div className="mt-12 overflow-hidden rounded-md border border-overlay/10">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3">
                {SOLUTION_FEATURES.map((feature, i) => (
                  <div
                    key={feature.title}
                    className={`group relative border-overlay/10 bg-surface p-8 transition-colors duration-500 hover:bg-surface-solid ${
                      i > 0 ? "border-t" : ""
                    } ${i < 2 ? "sm:border-t-0" : ""} ${
                      i % 2 === 1 ? "sm:border-l" : ""
                    } ${i % 3 === 0 ? "lg:border-l-0" : "lg:border-l"} ${
                      i < 3 ? "lg:border-t-0" : "lg:border-t"
                    }`}
                  >
                    <ShinyHoverBorder radiusClass="rounded-none" />
                    <div className="relative z-10">
                      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-overlay/10 bg-overlay/5 text-2xl text-ink-strong">
                        <i className={feature.icon} />
                      </div>
                      <h3 className="font-semibold text-ink-strong text-xl">
                        {feature.title}
                      </h3>
                      <p className="mt-3 text-ink-muted text-md leading-relaxed">
                        {feature.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Architecture */}
          <div className="mt-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="section-kicker">Architecture</p>
              <h2 className="section-title font-normal">
                Collateral to settlement
              </h2>
            </div>

            {/* Flow + config — one connected block */}
            <div className="mt-12 overflow-hidden rounded-md border border-overlay/10">
              <div className="divide-y divide-overlay/10">
                {/* Flow */}
                <div className="grid divide-y divide-overlay/10 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
                  {ARCHITECTURE_STEPS.map((step, i) => (
                    <div
                      key={step.title}
                      className="group relative bg-surface p-6 transition-colors duration-500 hover:bg-surface-solid sm:p-8"
                    >
                      <ShinyHoverBorder radiusClass="rounded-none" />
                      <div className="relative z-10">
                        <div className="mb-4 flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-md border border-overlay/10 bg-overlay/5 text-ink-strong text-xl">
                            <i className={step.icon} />
                          </span>
                          <span className="font-medium text-ink-strong/30 text-md">
                            0{i + 1}
                          </span>
                        </div>
                        <h3 className="font-semibold text-ink-strong text-lg">
                          {step.title}
                        </h3>
                        <p className="mt-2 text-ink-muted text-md leading-relaxed">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Config */}
                <div className="grid divide-y divide-overlay/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                  {CONFIG_CARDS.map((card) => (
                    <div
                      key={card.title}
                      className="group relative bg-surface p-6 transition-colors duration-500 hover:bg-surface-solid sm:p-8"
                    >
                      <ShinyHoverBorder radiusClass="rounded-none" />
                      <div className="relative z-10 flex items-start gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-overlay/10 bg-overlay/5 text-ink-strong text-xl">
                          <i className={card.icon} />
                        </span>
                        <div>
                          <h3 className="font-semibold text-ink-strong text-md">
                            {card.title}
                          </h3>
                          <p className="mt-1 text-ink-muted text-md leading-relaxed">
                            {card.desc}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Closing */}
          <div className="mx-auto mt-20 max-w-3xl text-center">
            <p className="text-ink-body text-xl italic leading-relaxed sm:text-2xl">
              &ldquo;4Mica is building the missing payment primitive that makes
              on-chain services commercially viable.&rdquo;
            </p>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
