import { links } from "@4mica/url";
import Footer from "@components/Footer";
import Header from "@components/Header";
import { createPageMetadata } from "@seo/shared";
import Link from "next/link";
import { messages } from "@/i18n";

export const metadata = createPageMetadata({
  title: messages.pricing.seo.title,
  description: messages.pricing.seo.description,
  keywords: [...messages.pricing.seo.keywords],
  url: "/pricing",
  imageAlt: messages.pricing.seo.imageAlt,
});

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

type Tier = {
  name: string;
  price: string;
  eyebrow?: string;
  tagline: string;
  features: readonly string[];
  cta: { label: string; href: string; external?: boolean };
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    ...messages.pricing.tiers[0],
    cta: {
      label: messages.pricing.tiers[0].ctaLabel,
      href: links.social.githubCore,
      external: true,
    },
  },
  {
    ...messages.pricing.tiers[1],
    cta: {
      label: messages.pricing.tiers[1].ctaLabel,
      href: links.mailto.sales,
      external: true,
    },
    highlight: true,
  },
  {
    ...messages.pricing.tiers[2],
    cta: {
      label: messages.pricing.tiers[2].ctaLabel,
      href: links.mailto.sales,
      external: true,
    },
  },
];

const INCLUDED = messages.pricing.included;

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-36 pb-20">
        <section className="w-full">
          {/* Header */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker">{messages.pricing.kicker}</p>
            <h1 className="section-title font-normal">
              {messages.pricing.title}
            </h1>
            <p className="section-lead mx-auto max-w-2xl">
              {messages.pricing.lead}
            </p>
          </div>

          {/* Tiers — connected block */}
          <div className="mt-14 overflow-hidden rounded-md border border-overlay/10">
            <div className="grid divide-y divide-overlay/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              {TIERS.map((tier) => (
                <div
                  key={tier.name}
                  className={`group relative p-8 transition-colors duration-500 sm:p-10 ${
                    tier.highlight
                      ? "bg-surface-solid hover:bg-surface"
                      : "bg-surface hover:bg-surface-solid"
                  }`}
                >
                  <ShinyHoverBorder radiusClass="rounded-none" />
                  <div className="relative z-10">
                    <div className="flex min-h-8 items-center gap-2">
                      <h2 className="font-semibold text-ink-strong text-xl">
                        {tier.name}
                      </h2>
                      {tier.eyebrow && (
                        <span className="rounded-full border border-overlay/20 bg-overlay/10 px-2.5 py-0.5 text-ink-strong text-md">
                          {tier.eyebrow}
                        </span>
                      )}
                    </div>

                    <div className="mt-5 flex items-baseline gap-1">
                      <span className="font-semibold text-3xl text-ink-strong tracking-tight">
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
                          <i className="ri-check-line mt-0.5 text-ink-strong" />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {tier.cta.external ? (
                      <a
                        href={tier.cta.href}
                        className={`mt-8 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-5 py-2.5 font-semibold text-md transition-colors ${
                          tier.highlight
                            ? "bg-ink-strong text-surface-deep hover:bg-ink-strong/90"
                            : "border border-overlay/15 bg-overlay/5 text-ink-strong hover:bg-overlay/10"
                        }`}
                      >
                        {tier.cta.label}
                      </a>
                    ) : (
                      <Link
                        href={tier.cta.href}
                        className={`mt-8 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-5 py-2.5 font-semibold text-md transition-colors ${
                          tier.highlight
                            ? "bg-ink-strong text-surface-deep hover:bg-ink-strong/90"
                            : "border border-overlay/15 bg-overlay/5 text-ink-strong hover:bg-overlay/10"
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
            {messages.pricing.collateralNote}
          </p>

          <section className="mt-24">
            <div className="mb-10 max-w-2xl">
              <p className="section-kicker">
                {messages.pricing.includedKicker}
              </p>
              <h2 className="section-title font-normal">
                {messages.pricing.includedTitle}
              </h2>
              <p className="section-lead max-w-xl">
                {messages.pricing.includedLead}
              </p>
            </div>

            <div className="grid grid-cols-1 overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25 sm:grid-cols-2 lg:grid-cols-4">
              {INCLUDED.map((item) => (
                <div
                  key={item.title}
                  className="group relative border-overlay/10 border-b p-6 transition-colors duration-500 hover:bg-overlay/[0.018] sm:nth-last-[-n+2]:border-b-0 sm:odd:border-r lg:border-r lg:border-b-0 lg:last:border-r-0"
                >
                  <ShinyHoverBorder radiusClass="rounded-none" />
                  <div className="relative z-10">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-overlay/10 bg-overlay/5 text-2xl text-ink-strong">
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
