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
  cadence?: string;
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
    ],
    cta: {
      label: "Start building",
      href: links.social.githubCore,
      external: true,
    },
  },
  {
    name: "Scale",
    price: "Usage-based",
    tagline: "Go to mainnet and pay a small fee per settlement.",
    features: [
      "Mainnet across supported chains",
      "Batched on-chain settlement",
      "Yield on collateral",
      "Email support",
    ],
    cta: { label: "Talk to sales", href: links.mailto.contact, external: true },
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    tagline: "Volume pricing, SLAs, and dedicated support.",
    features: [
      "Custom SLAs & terms",
      "Priority settlement",
      "Dedicated support",
      "Security review",
    ],
    cta: { label: "Contact sales", href: links.mailto.contact, external: true },
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
              Simple, usage-based pricing
            </h1>
            <p className="section-lead mx-auto max-w-2xl">
              Start free on testnets and pay only as you settle. No setup fees,
              no prefunding, no lock-in.
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
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-ink-strong text-xl">
                        {tier.name}
                      </h2>
                      {tier.highlight && (
                        <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-ink-strong text-md">
                          Most popular
                        </span>
                      )}
                    </div>

                    <div className="mt-5 flex items-baseline gap-1">
                      <span className="font-semibold text-3xl text-white tracking-tight">
                        {tier.price}
                      </span>
                      {tier.cadence && (
                        <span className="text-ink-muted text-md">
                          {tier.cadence}
                        </span>
                      )}
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
        </section>
      </div>
      <Footer />
    </div>
  );
}
