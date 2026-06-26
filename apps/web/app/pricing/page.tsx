import { links } from "@4mica/url";
import Footer from "@components/Footer";
import Header from "@components/Header";
import { createPageMetadata } from "@seo/shared";
import Link from "next/link";

export const metadata = createPageMetadata({
  title: "4Mica Pricing | Usage-Based Credit Payments",
  description:
    "Simple, usage-based pricing for 4Mica's credit-backed payment rails. Start free on testnets and pay as you settle.",
  keywords: [
    "4Mica pricing",
    "usage-based pricing",
    "payment infrastructure pricing",
    "x402 pricing",
    "credit payments",
  ],
  url: "/pricing",
  imageAlt: "4Mica pricing",
});

function ShinyHoverBorder({
  radiusClass = "rounded-md",
}: {
  radiusClass?: string;
}) {
  return (
    <>
      <div
        className={`pointer-events-none absolute inset-0 z-20 border border-white/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${radiusClass}`}
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

type Tier = {
  name: string;
  price: string;
  eyebrow?: string;
  tagline: string;
  features: string[];
  cta: { label: string; href: string; external?: boolean };
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Build",
    price: "Free",
    tagline: "Ship your integration on testnets with full SDK access.",
    features: [
      "All supported testnets",
      "TypeScript & Python SDKs",
      "x402 facilitator access",
      "Community support",
      "Protocol docs and examples",
      "Basic settlement sandbox",
    ],
    cta: {
      label: "Start building",
      href: links.social.githubCore,
      external: true,
    },
  },
  {
    name: "Scale",
    eyebrow: "Most popular",
    price: "Volume-based",
    tagline:
      "Pay a percentage of cleared transaction volume. Settlement costs included.",
    features: [
      "Mainnet across chains",
      "% fee on cleared volume",
      "Settlement costs covered",
      "Yield passed through",
      "Production facilitator access",
      "Usage and settlement reporting",
      "Email support",
    ],
    cta: { label: "Talk to sales", href: links.mailto.contact, external: true },
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    tagline:
      "Custom terms for high volume networks, facilitators, and marketplaces.",
    features: [
      "Custom clearing fee",
      "Volume commitments",
      "Priority settlement",
      "Yield-sharing options",
      "Dedicated support",
      "Custom SLAs and terms",
      "Security review",
    ],
    cta: { label: "Contact sales", href: links.mailto.contact, external: true },
  },
];

const INCLUDED = [
  {
    icon: "ri-bank-line",
    title: "Non-custodial collateral",
    desc: "Collateral remains controlled by protocol contracts and backs open payment obligations.",
  },
  {
    icon: "ri-exchange-dollar-line",
    title: "Batched settlement",
    desc: "Many off-chain guarantees collapse into fewer on-chain settlement actions.",
  },
  {
    icon: "ri-seedling-line",
    title: "Yield-aware design",
    desc: "Supported collateral can earn yield while it backs credit-based payment activity.",
  },
  {
    icon: "ri-code-box-line",
    title: "SDK-first integration",
    desc: "Use TypeScript and Python clients with x402-compatible HTTP payment flows.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-36 pb-20">
        <section className="w-full">
          {/* Header */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker">Pricing</p>
            <h1 className="section-title font-normal">
              Pricing that scales with settlement volume
            </h1>
            <p className="section-lead mx-auto max-w-2xl">
              Build free on testnets, then move to volume-based pricing when
              payments clear on mainnet. No per-request gas billing, no surprise
              settlement line items.
            </p>
          </div>

          {/* Tiers — connected block */}
          <div className="mt-14 overflow-hidden rounded-md border border-white/10">
            <div className="grid divide-y divide-white/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              {TIERS.map((tier) => (
                <div
                  key={tier.name}
                  className={`group relative p-8 transition-colors duration-500 sm:p-10 ${
                    tier.highlight
                      ? "bg-[#101010] hover:bg-[#161616]"
                      : "bg-[#0a0a0a] hover:bg-[#101010]"
                  }`}
                >
                  <ShinyHoverBorder radiusClass="rounded-none" />
                  <div className="relative z-10">
                    <div className="flex min-h-8 items-center gap-2">
                      <h2 className="font-semibold text-ink-strong text-xl">
                        {tier.name}
                      </h2>
                      {tier.eyebrow && (
                        <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-ink-strong text-md">
                          {tier.eyebrow}
                        </span>
                      )}
                    </div>

                    <div className="mt-5 flex items-baseline gap-1">
                      <span className="font-semibold text-3xl text-white tracking-tight">
                        {tier.price}
                      </span>
                    </div>
                    <p className="mt-2 text-ink-muted text-md leading-relaxed">
                      {tier.tagline}
                    </p>

                    <ul className="mt-6 space-y-3">
                      {tier.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2.5 text-ink-body text-md"
                        >
                          <i className="ri-check-line mt-0.5 text-white" />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {tier.cta.external ? (
                      <a
                        href={tier.cta.href}
                        className={`mt-8 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-5 py-2.5 font-semibold text-md transition-colors ${
                          tier.highlight
                            ? "bg-white text-black hover:bg-white/90"
                            : "border border-white/15 bg-white/5 text-ink-strong hover:bg-white/10"
                        }`}
                      >
                        {tier.cta.label}
                      </a>
                    ) : (
                      <Link
                        href={tier.cta.href}
                        className={`mt-8 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-5 py-2.5 font-semibold text-md transition-colors ${
                          tier.highlight
                            ? "bg-white text-black hover:bg-white/90"
                            : "border border-white/15 bg-white/5 text-ink-strong hover:bg-white/10"
                        }`}
                      >
                        {tier.cta.label}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-8 text-center text-ink-subtle text-md">
            Collateral stays in your control and earns yield — 4Mica never holds
            funds.
          </p>

          <section className="mt-24">
            <div className="mb-10 max-w-2xl">
              <p className="section-kicker">Included</p>
              <h2 className="section-title font-normal">
                Core rails across every plan
              </h2>
              <p className="section-lead max-w-xl">
                The plan changes how you go live and operate at scale. The core
                payment model stays consistent from sandbox to production.
              </p>
            </div>

            <div className="grid grid-cols-1 overflow-hidden rounded-md border border-white/10 bg-black/25 sm:grid-cols-2 lg:grid-cols-4">
              {INCLUDED.map((item) => (
                <div
                  key={item.title}
                  className="group relative border-white/10 border-b p-6 transition-colors duration-500 hover:bg-white/[0.018] sm:nth-last-[-n+2]:border-b-0 sm:odd:border-r lg:border-r lg:border-b-0 lg:last:border-r-0"
                >
                  <ShinyHoverBorder radiusClass="rounded-none" />
                  <div className="relative z-10">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-white/10 bg-white/5 text-2xl text-white">
                      <i className={item.icon} />
                    </div>
                    <h3 className="font-semibold text-ink-strong text-lg">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-ink-muted text-md leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>
      <Footer />
    </div>
  );
}
