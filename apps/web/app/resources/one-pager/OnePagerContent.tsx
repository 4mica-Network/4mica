"use client";

import Image from "next/image";

export default function OnePagerContent() {
  return (
    <div className="relative min-h-screen text-ink-body">
      <div className="relative z-10">
        {/* Header */}
        <div className="pt-20 pb-16 text-center">
          <h1 className="section-title-lg mb-4 text-ink-strong">
            Credit-backed, Capital-efficient, and Instant payments for any
            service, web3 or traditional.
          </h1>
        </div>

        <div className="container mx-auto px-6 pb-20">
          {/* Problem Statement & Use Case */}
          <div className="mb-20 grid grid-cols-1 gap-12 lg:grid-cols-2">
            {/* Problem Statement - Left */}
            <div className="glass-panel rounded-2xl p-8">
              <h2 className="mb-6 flex items-center font-bold text-3xl text-ink-strong">
                <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-red-500">
                  <div className="flex h-4 w-4 items-center justify-center">
                    <i className="ri-error-warning-line text-lg text-white"></i>
                  </div>
                </div>
                Problem
              </h2>

              <p className="mb-6 text-ink-body text-lg leading-relaxed">
                Any service deployed on web3 rails lack a capital-efficient,
                cheap, and non-custodial way to pay in real time.
              </p>

              <div className="space-y-4">
                <p className="font-semibold text-ink-strong">
                  Current workarounds lead to:
                </p>
                <ul className="space-y-3">
                  {[
                    "Centralized trust",
                    "Fragmented liquidity",
                    "Locked capital (capital inefficiency)",
                    "UX & regulatory friction",
                  ].map((item) => (
                    <li key={item} className="flex items-center text-ink-body">
                      <div className="mr-3 h-2 w-2 rounded-full bg-red-500"></div>
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 rounded-lg border border-red-400/30 bg-red-500/15 p-4">
                  <p className="font-semibold text-red-200">
                    The result: per-task billing is nearly impossible at scale →
                    slowed adoption.
                  </p>
                </div>
              </div>
            </div>

            {/* Use Case - Right */}
            <div className="glass-panel rounded-2xl p-8">
              <h2 className="mb-6 flex items-center font-bold text-3xl text-ink-strong">
                <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-brand-strong">
                  <div className="flex h-4 w-4 items-center justify-center">
                    <i className="ri-lightbulb-line text-lg text-white"></i>
                  </div>
                </div>
                Case Study: API Monetization
              </h2>

              <div className="mb-6">
                <Image
                  src="/assets/aligned_layer_logo.png"
                  alt="Aligned Layer"
                  width={320}
                  height={120}
                  className="mx-auto mb-4 h-30 w-1/2 max-w-[50%] object-contain"
                />
              </div>

              <div className="space-y-4">
                <ul className="space-y-5">
                  <li className="flex items-start text-ink-body text-lg">
                    <div className="mt-2 mr-3 h-3 w-3 rounded-full bg-brand-strong"></div>
                    Aligned offers ultra-cheap verification costs
                  </li>
                  <li className="flex items-start text-ink-body text-lg">
                    <div className="mt-2 mr-3 h-3 w-3 rounded-full bg-brand-strong"></div>
                    Aligned cost: &nbsp;
                    <span className="font-bold text-brand-strong text-xl">
                      $0.019
                    </span>{" "}
                    &nbsp;vs payment gas fee: &nbsp;
                    <span className="font-bold text-red-500 text-xl">
                      $0.14
                    </span>
                  </li>
                  <li className="flex items-start text-ink-body text-lg">
                    <div className="mt-2 mr-3 h-3 w-3 rounded-full bg-brand-strong"></div>
                    Transaction gas fees are 8x higher than the service cost
                    &nbsp;
                  </li>
                  <li className="flex items-start text-ink-body text-lg">
                    <div className="mt-2 mr-3 h-3 w-3 rounded-full bg-brand-strong"></div>
                    Payment limitations prevent scaling
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* 4Mica Solution */}
          <div className="glass-panel mb-20 rounded-2xl p-8">
            <h2 className="mb-6 flex items-center justify-center font-bold text-3xl text-ink-strong">
              <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-green-500">
                <div className="flex h-4 w-4 items-center justify-center">
                  <i className="ri-check-line text-lg text-white"></i>
                </div>
              </div>
              4Mica Solution
            </h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "Line of Credit",
                  description:
                    'Enables cryptographically-backed "lines of credit"',
                  icon: "ri-bank-card-line",
                },
                {
                  title: "Instant Payments",
                  description:
                    "One yield-generating deposit → backs thousands of instant micro-payments",
                  icon: "ri-flashlight-line",
                },
                {
                  title: "Configurable SLAs",
                  description: "Configurable TTLs & SLAs, for full flexibility",
                  icon: "ri-settings-3-line",
                },
                {
                  title: "Secure and Trustless Settlement",
                  description:
                    "Settlement automatically enforced on parent chain (no value leakage)",
                  icon: "ri-shield-check-line",
                },
                {
                  title: "Flexible Integration",
                  description:
                    "Flexible and composable across any service that accepts crypto",
                  icon: "ri-puzzle-line",
                },
                {
                  title: "Multi-Platform Support",
                  description:
                    "Composable payment infrastructure for APIs, agents, and on-chain services",
                  icon: "ri-links-line",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-white/10 bg-white/10 p-6 text-center"
                >
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500">
                    <div className="flex h-6 w-6 items-center justify-center">
                      <i className={`${item.icon} text-white text-xl`}></i>
                    </div>
                  </div>
                  <h3 className="mb-2 font-bold text-ink-strong">
                    {item.title}
                  </h3>
                  <p className="text-ink-body text-sm">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Architecture Section */}
          <div className="glass-panel mb-12 rounded-2xl p-8">
            <h2 className="mb-8 flex items-center justify-center text-center font-bold text-3xl text-ink-strong">
              <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-brand-deep">
                <div className="flex h-4 w-4 items-center justify-center">
                  <i className="ri-settings-3-line text-lg text-white"></i>
                </div>
              </div>
              Architecture
            </h2>

            <div className="mb-8 flex flex-col items-center justify-center space-y-8 lg:flex-row lg:space-x-8 lg:space-y-0">
              <div className="flex flex-col items-center space-y-4 lg:flex-row lg:space-x-6 lg:space-y-0">
                <div className="min-w-[160px] rounded-lg border border-white/10 bg-white/10 p-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-deep">
                    <div className="flex h-6 w-6 items-center justify-center">
                      <i className="ri-safe-line text-white text-xl"></i>
                    </div>
                  </div>
                  <h3 className="mb-2 font-bold text-ink-strong">Collateral</h3>
                  <p className="text-ink-body text-sm">
                    Deposit in yield-generating vault
                  </p>
                </div>

                <div className="flex h-8 w-8 items-center justify-center">
                  <i className="ri-arrow-right-line text-2xl text-white"></i>
                </div>

                <div className="min-w-[160px] rounded-lg border border-white/10 bg-white/10 p-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-strong">
                    <div className="flex h-6 w-6 items-center justify-center">
                      <i className="ri-bank-card-line text-white text-xl"></i>
                    </div>
                  </div>
                  <h3 className="mb-2 font-bold text-ink-strong">
                    Line of Credit
                  </h3>
                  <p className="text-ink-body text-sm">
                    Instant access to service
                  </p>
                </div>

                <div className="flex h-8 w-8 items-center justify-center">
                  <i className="ri-arrow-right-line text-2xl text-white"></i>
                </div>

                <div className="min-w-[160px] rounded-lg border border-white/10 bg-white/10 p-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-violet">
                    <div className="flex h-6 w-6 items-center justify-center">
                      <i className="ri-flashlight-line text-white text-xl"></i>
                    </div>
                  </div>
                  <h3 className="mb-2 font-bold text-ink-strong">
                    Instant Value-Exchange
                  </h3>
                  <p className="text-ink-body text-sm">
                    Cryptographic payment tabs
                  </p>
                </div>

                <div className="flex h-8 w-8 items-center justify-center">
                  <i className="ri-arrow-right-line text-2xl text-white"></i>
                </div>

                <div className="min-w-[160px] rounded-lg border border-white/10 bg-white/10 p-6 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-deep">
                    <div className="flex h-6 w-6 items-center justify-center">
                      <i className="ri-shield-check-line text-white text-xl"></i>
                    </div>
                  </div>
                  <h3 className="mb-2 font-bold text-ink-strong">
                    Settlement on L1
                  </h3>
                  <p className="text-ink-body text-sm">
                    Secure and trustless by design
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/10 p-4 text-center">
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-brand-strong">
                  <div className="flex h-4 w-4 items-center justify-center">
                    <i className="ri-time-line text-white"></i>
                  </div>
                </div>
                <h4 className="mb-1 font-semibold text-ink-strong">
                  Configurable TTL{" "}
                </h4>
                <p className="text-ink-body text-xs">Time-to-live settings</p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/10 p-4 text-center">
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-brand-violet">
                  <div className="flex h-4 w-4 items-center justify-center">
                    <i className="ri-percent-line text-white"></i>
                  </div>
                </div>
                <h4 className="mb-1 font-semibold text-ink-strong">
                  Collateral Ratio
                </h4>
                <p className="text-ink-body text-xs">Risk management</p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/10 p-4 text-center">
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-brand-deep">
                  <div className="flex h-4 w-4 items-center justify-center">
                    <i className="ri-shield-line text-white"></i>
                  </div>
                </div>
                <h4 className="mb-1 font-semibold text-ink-strong">
                  Configurable SLA
                </h4>
                <p className="text-ink-body text-xs">Service agreements</p>
              </div>
            </div>
          </div>

          {/* Footer Message */}
          <div className="text-center">
            <p className="font-medium text-ink/90 text-xl italic">
              &ldquo;4Mica is building the missing payment primitive that makes
              on-chain services commercially viable.&rdquo;
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
