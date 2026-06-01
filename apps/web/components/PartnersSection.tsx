"use client";

import Image from "next/image";
import Link from "next/link";

const BLUE = "#7bcbff";

const PRIMITIVES = [
  {
    name: "x402",
    role: "Payment protocol",
    desc: "The HTTP payment standard 4Mica extends with a credit layer. Any x402-compatible client works out of the box.",
    icon: "ri-global-line",
  },
  {
    name: "Aave",
    role: "Yield layer",
    desc: "All collateral routes directly to Aave. Deposits earn APY continuously. Your payment infrastructure generates returns.",
    icon: "ri-plant-line",
  },
  {
    name: "Ethereum / Base",
    role: "Settlement layer",
    desc: "Net positions settle on-chain via EVM-compatible contracts. One transaction per settlement window, cryptographically enforced.",
    icon: "ri-links-line",
  },
];

const PARTNERS = [
  {
    name: "Aligned Layer",
    logo: "/assets/aligned_layer_logo.png",
    href: "https://alignedlayer.com/",
  },
  {
    name: "ChaosChain",
    logo: "/assets/chaos_chain_logo.svg",
    href: "https://chaoscha.in/",
  },
  { name: "Wachai", logo: "/assets/wachai.png", href: "https://wach.ai/" },
];

const TRUST_POINTS = [
  {
    icon: "ri-lock-line",
    label: "Non-custodial",
    desc: "You own your collateral. 4Mica never holds funds.",
  },
  {
    icon: "ri-code-s-slash-line",
    label: "Open-source core",
    desc: "Contracts and SDKs are public on GitHub.",
  },
  {
    icon: "ri-test-tube-line",
    label: "Testnet live",
    desc: "Deposit, spend, and earn on Sepolia today.",
  },
];

export default function PartnersSection() {
  return (
    <section className="section-gloss py-24">
      <div className="container mx-auto px-6">
        {/* Ecosystem primitives */}
        <div className="mb-12 text-center">
          <p className="section-kicker">Ecosystem</p>
          <h2 className="section-title">
            Built on primitives you already trust
          </h2>
          <p className="section-lead mx-auto max-w-xl">
            4Mica is not a new protocol stack. It is a credit layer on top of
            production infrastructure.
          </p>
        </div>

        <div className="mx-auto mb-16 grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-3">
          {PRIMITIVES.map((p) => (
            <div
              key={p.name}
              className="glass-panel flex flex-col gap-3 rounded-2xl p-6"
              style={{ borderColor: `${BLUE}28` }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: `${BLUE}1a` }}
              >
                <i className={`${p.icon} text-lg`} style={{ color: BLUE }} />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-ink-strong text-sm">
                    {p.name}
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: `${BLUE}bb` }}
                  >
                    {p.role}
                  </span>
                </div>
                <p className="mt-1.5 text-ink-muted text-xs leading-relaxed">
                  {p.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="mb-16 border-white/10 border-t" />

        {/* Trust points */}
        <div className="mx-auto mb-16 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          {TRUST_POINTS.map((t) => (
            <div key={t.label} className="flex items-start gap-3">
              <div
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ background: "rgb(var(--brand) / 0.16)" }}
              >
                <i
                  className={`${t.icon} text-sm`}
                  style={{ color: "rgb(var(--brand))" }}
                />
              </div>
              <div>
                <p className="font-semibold text-ink-strong text-sm">
                  {t.label}
                </p>
                <p className="mt-0.5 text-ink-muted text-xs">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Partner logos */}
        <div className="mb-8 text-center">
          <p className="mb-6 text-ink-subtle text-xs uppercase tracking-widest">
            Teams building on 4Mica
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6">
            {PARTNERS.map((partner) => (
              <Link
                key={partner.name}
                href={partner.href}
                target="_blank"
                rel="noreferrer"
                className="glass-panel flex items-center justify-center rounded-xl p-3 transition-all duration-300 hover:border-brand/30"
                aria-label={`${partner.name} homepage`}
              >
                <Image
                  src={partner.logo}
                  alt={partner.name}
                  width={160}
                  height={48}
                  className="max-h-12 w-auto object-contain grayscale filter transition-all duration-300 hover:grayscale-0"
                />
              </Link>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href="/resources/technical-docs"
            className="btn btn-primary btn-lg text-center"
          >
            Start Building
          </Link>
          <Link
            href="https://github.com/4mica-Network/4mica-core/"
            target="_blank"
            rel="noreferrer"
            className="btn btn-soft btn-lg text-center"
          >
            <i className="ri-github-fill" />
            View on GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}
