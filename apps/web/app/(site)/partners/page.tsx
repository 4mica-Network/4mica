import { links } from "@4mica/url";
import Footer from "@components/Footer";
import Header from "@components/Header";
import JsonLd from "@components/JsonLd";
import SectionBackdrop from "@components/SectionBackdrop";
import ShinyHoverBorder from "@components/ShinyHoverBorder";
import { metaFor } from "@seo/pages";
import { faqSchema, pageSchema } from "@seo/structuredData";
import Image from "next/image";
import Link from "next/link";
import { PARTNERS } from "@/app/(home)/data";
import { messages } from "@/i18n";

export const metadata = metaFor("/partners");

const content = messages.partners;

function SectionHeader({
  kicker,
  title,
  lead,
  align = "center",
}: {
  kicker: string;
  title: string;
  lead?: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={
        align === "center" ? "mb-12 text-center" : "mb-10 max-w-2xl text-left"
      }
    >
      <p className="section-kicker">{kicker}</p>
      <h2 className="section-title font-normal">{title}</h2>
      {lead ? (
        <p
          className={`section-lead ${
            align === "center" ? "mx-auto max-w-2xl" : "max-w-xl"
          }`}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}

function PartnersHero() {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="section-kicker">{content.kicker}</p>
      <h1 className="section-title text-balance font-normal">
        {content.title}
      </h1>
      <p className="section-lead mx-auto max-w-2xl">{content.lead}</p>

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <a
          href={content.primaryCtaHref}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-ink-strong px-5 py-2.5 font-semibold text-md text-surface-deep transition-colors hover:bg-ink-strong/90"
        >
          {content.primaryCta}
          <i className="ri-arrow-right-line text-md" />
        </a>
        <a
          href="#programs"
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-overlay/15 bg-overlay/5 px-5 py-2.5 font-semibold text-ink-strong text-md transition-colors hover:bg-overlay/10"
        >
          {content.secondaryCta}
        </a>
      </div>
    </div>
  );
}

function EcosystemLogos() {
  return (
    <div className="mt-16 overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25">
      <div className="border-overlay/10 border-b px-6 py-6 text-center sm:px-8">
        <p className="font-medium text-ink-strong text-xl">
          {content.ecosystem.title}
        </p>
        <p className="mt-1.5 text-ink-muted text-md leading-relaxed">
          {content.ecosystem.lead}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 px-6 py-8">
        {PARTNERS.map((partner) => (
          <Link
            key={partner.name}
            href={partner.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`${partner.name} homepage`}
            className="flex items-center justify-center rounded-md p-3"
          >
            <Image
              src={partner.logo}
              alt={`${partner.name} logo`}
              width={160}
              height={48}
              className={`max-h-12 w-auto object-contain grayscale filter transition-all duration-300 hover:grayscale-0 ${
                "invertOnLight" in partner && partner.invertOnLight
                  ? "invert dark:invert-0"
                  : ""
              } ${
                "invertOnDark" in partner && partner.invertOnDark
                  ? "dark:invert"
                  : ""
              }`}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

function WhyPartner() {
  return (
    <section className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <SectionHeader
          kicker={content.why.kicker}
          title={content.why.title}
          lead={content.why.lead}
        />

        <div className="overflow-hidden rounded-md border border-overlay/10">
          <div className="grid divide-y divide-overlay/10 sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
            {content.why.cards.map((card) => (
              <div
                key={card.title}
                className="group relative bg-surface p-8 transition-colors duration-500 hover:bg-surface-solid"
              >
                <ShinyHoverBorder radiusClass="rounded-none" />
                <div className="relative z-10">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-overlay/10 bg-overlay/5 text-2xl text-ink-strong">
                    <i className={card.icon} />
                  </div>
                  <h3 className="font-semibold text-ink-strong text-xl">
                    {card.title}
                  </h3>
                  <p className="mt-3 text-ink-muted text-md leading-relaxed">
                    {card.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PartnerPrograms() {
  return (
    <section id="programs" className="section-gloss scroll-mt-28 py-24">
      <div className="mx-auto w-full max-w-300">
        <SectionHeader
          kicker={content.programs.kicker}
          title={content.programs.title}
          lead={content.programs.lead}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {content.programs.items.map((program) => (
            <div
              key={program.label}
              className="group relative flex flex-col rounded-md border border-overlay/10 bg-surface-deep/25 p-8 transition-colors duration-500 hover:bg-overlay/[0.018]"
            >
              <ShinyHoverBorder />
              <div className="relative z-10 flex flex-1 flex-col">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-md bg-overlay/[0.035] text-2xl text-ink-strong ring-1 ring-overlay/10">
                  <i className={program.icon} />
                </div>
                <p className="font-medium text-ink-muted text-md uppercase tracking-widest">
                  {program.label}
                </p>
                <h3 className="mt-3 font-semibold text-ink-strong text-xl">
                  {program.title}
                </h3>
                <p className="mt-3 text-ink-muted text-md leading-relaxed">
                  {program.desc}
                </p>

                <ul className="mt-6 space-y-3">
                  {program.points.map((point) => (
                    <li key={point} className="flex gap-3 text-md">
                      <i
                        className="ri-check-line mt-0.5 shrink-0 text-ink-strong/60"
                        aria-hidden="true"
                      />
                      <span className="text-ink-body leading-relaxed">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>

                <a
                  href={program.href}
                  className="mt-8 inline-flex items-center gap-1.5 self-start font-semibold text-ink-strong text-md transition-colors hover:text-ink-body"
                >
                  {program.cta}
                  <i className="ri-arrow-right-line text-md transition-transform duration-300 group-hover:translate-x-0.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PartnerBenefits() {
  return (
    <section className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <SectionHeader
          kicker={content.benefits.kicker}
          title={content.benefits.title}
          lead={content.benefits.lead}
        />

        <div className="overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25">
          <div className="grid grid-cols-1 divide-y divide-overlay/10 sm:grid-cols-2 lg:grid-cols-3">
            {content.benefits.items.map((benefit) => (
              <div
                key={benefit.title}
                className="group relative flex gap-4 border-overlay/10 p-6 transition-colors duration-500 hover:bg-overlay/[0.018] sm:border-r sm:last:border-r-0"
              >
                <ShinyHoverBorder radiusClass="rounded-none" />
                <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-overlay/[0.035] text-ink-strong ring-1 ring-overlay/10">
                  <i className={`${benefit.icon} text-2xl`} />
                </div>
                <div className="relative z-10 min-w-0">
                  <h3 className="font-semibold text-ink-strong text-lg">
                    {benefit.title}
                  </h3>
                  <p className="mt-2 text-ink-muted text-md leading-relaxed">
                    {benefit.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PartnerProcess() {
  return (
    <section className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <SectionHeader
          kicker={content.process.kicker}
          title={content.process.title}
          lead={content.process.lead}
        />

        <ol className="grid grid-cols-1 overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25 lg:grid-cols-3">
          {content.process.steps.map((step, index) => (
            <li
              key={step.order}
              className="group relative border-overlay/10 border-b p-7 transition-colors duration-500 last:border-b-0 hover:bg-overlay/[0.018] lg:border-r lg:border-b-0 lg:last:border-r-0"
            >
              <ShinyHoverBorder radiusClass="rounded-none" />
              <div className="relative z-10">
                <div className="mb-8 flex items-center justify-between">
                  <span className="font-medium text-5xl text-ink-strong/20 leading-none transition-colors duration-500 group-hover:text-ink-strong/35">
                    {step.order}
                  </span>
                  <i
                    className={`ri-arrow-right-line hidden text-2xl text-ink-subtle ${
                      index === content.process.steps.length - 1
                        ? ""
                        : "lg:block"
                    }`}
                  />
                </div>
                <h3 className="font-semibold text-ink-strong text-xl">
                  {step.title}
                </h3>
                <p className="mt-3 text-ink-muted text-md leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function OtherWays() {
  return (
    <section className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <SectionHeader
          kicker={content.other.kicker}
          title={content.other.title}
          align="left"
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {content.other.items.map((item) => (
            <a
              key={item.title}
              href={item.href}
              className="group relative flex min-h-48 flex-col rounded-md border border-overlay/10 bg-surface-deep/25 p-6 transition-colors duration-500 hover:bg-overlay/[0.018]"
            >
              <ShinyHoverBorder />
              <div className="relative z-10 mb-8 flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-overlay/[0.035] text-ink-strong ring-1 ring-overlay/10">
                  <i className={`${item.icon} text-2xl`} />
                </div>
                <i className="ri-arrow-right-up-line text-ink-subtle text-xl transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink-body" />
              </div>
              <div className="relative z-10 mt-auto">
                <h3 className="font-semibold text-ink-strong text-xl">
                  {item.title}
                </h3>
                <p className="mt-2 text-ink-muted text-md leading-relaxed">
                  {item.desc}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 font-semibold text-ink-strong text-md">
                  {item.cta}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function PartnerFaq() {
  return (
    <section id="faq" className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <SectionHeader
          kicker={content.faq.kicker}
          title={content.faq.title}
          align="left"
        />

        <div className="w-full">
          {content.faq.items.map((faq, index) => {
            const isLast = index === content.faq.items.length - 1;

            return (
              <details
                key={faq.question}
                className={`group ${isLast ? "" : "border-overlay/10 border-b"}`}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-0 pt-6 pb-4 text-left marker:hidden">
                  <span className="font-semibold text-ink-strong text-md">
                    {faq.question}
                  </span>
                  <i className="ri-arrow-down-s-line ml-4 shrink-0 text-ink-subtle text-xl transition-transform duration-200 group-open:-rotate-180" />
                </summary>
                <p className="pb-6 text-ink-muted text-md leading-relaxed">
                  {faq.answer}
                </p>
              </details>
            );
          })}
        </div>

        <div className="mt-14 flex items-center justify-start gap-1.5 text-md">
          <span className="font-normal text-ink-muted">
            {content.faq.contactPrompt}
          </span>
          <a
            href={links.mailto.partnership}
            className="text-ink-muted underline underline-offset-4 transition-colors hover:text-ink-strong"
          >
            {content.faq.contactCta}
          </a>
        </div>
      </div>
    </section>
  );
}

function PartnerEnablement() {
  return (
    <section className="section-gloss relative isolate overflow-hidden py-24">
      <SectionBackdrop src="/bg/abstract-satin-folds.avif" position="left" />
      <div className="mx-auto w-full max-w-300">
        <SectionHeader
          kicker={content.enablement.kicker}
          title={content.enablement.title}
          lead={content.enablement.lead}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.enablement.pillars.map((pillar) => (
            <div
              key={pillar.label}
              className="group relative flex flex-col rounded-md border border-overlay/10 bg-surface-deep/25 p-6 transition-colors duration-500 hover:bg-overlay/[0.018]"
            >
              <ShinyHoverBorder />
              <div className="relative z-10 flex flex-1 flex-col">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-overlay/[0.035] text-2xl text-ink-strong ring-1 ring-overlay/10">
                  <i className={pillar.icon} />
                </div>
                <p className="font-medium text-ink-muted text-md uppercase tracking-widest">
                  {pillar.label}
                </p>
                <h3 className="mt-2 font-semibold text-ink-strong text-lg">
                  {pillar.title}
                </h3>
                <ul className="mt-5 space-y-3">
                  {pillar.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-md">
                      <i
                        className="ri-check-line mt-0.5 shrink-0 text-ink-strong/60"
                        aria-hidden="true"
                      />
                      <span className="text-ink-body leading-relaxed">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PartnerStories() {
  return (
    <section className="section-gloss relative isolate overflow-hidden py-24">
      <SectionBackdrop src="/bg/abstract-smoke.avif" position="right" />
      <div className="mx-auto w-full max-w-300">
        <SectionHeader
          kicker={content.stories.kicker}
          title={content.stories.title}
          lead={content.stories.lead}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_0.8fr] lg:items-stretch">
          {content.stories.items.map((story) => (
            <div
              key={story.partner}
              className="group relative flex flex-col rounded-md border border-overlay/10 bg-surface-deep/25 p-8 transition-colors duration-500 hover:bg-overlay/[0.018]"
            >
              <ShinyHoverBorder />
              <div className="relative z-10 flex flex-1 flex-col">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <Image
                    src={story.logo}
                    alt={`${story.partner} logo`}
                    width={200}
                    height={60}
                    className="h-9 w-auto object-contain opacity-90"
                  />
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-overlay/10 bg-overlay/5 px-3 py-1 text-ink-muted text-md uppercase tracking-widest">
                    <i className="ri-lightbulb-line text-ink-strong" />
                    {story.tag}
                  </span>
                </div>
                <p className="text-ink-muted text-md leading-relaxed">
                  {story.challenge}
                </p>
                <p className="mt-4 text-ink-body text-md leading-relaxed">
                  {story.outcome}
                </p>
                <div className="mt-6 flex items-baseline gap-3 border-overlay/10 border-t pt-6">
                  <span className="font-bold text-4xl text-ink-strong tabular-nums">
                    {story.stat.value}
                  </span>
                  <span className="text-ink-muted text-md leading-snug">
                    {story.stat.label}
                  </span>
                </div>
                <Link
                  href={story.href}
                  className="mt-8 inline-flex items-center gap-1.5 self-start font-semibold text-ink-strong text-md transition-colors hover:text-ink-body"
                >
                  {story.cta}
                  <i className="ri-arrow-right-line text-md transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          ))}

          <div className="relative flex flex-col justify-center rounded-md border border-overlay/10 border-dashed bg-surface-deep/10 p-8">
            <h3 className="font-semibold text-ink-strong text-xl">
              {content.stories.invite.title}
            </h3>
            <p className="mt-3 text-ink-muted text-md leading-relaxed">
              {content.stories.invite.desc}
            </p>
            <a
              href={content.stories.invite.href}
              className="mt-6 inline-flex items-center justify-center gap-1.5 self-start rounded-md bg-ink-strong px-5 py-2.5 font-semibold text-md text-surface-deep transition-colors hover:bg-ink-strong/90"
            >
              {content.stories.invite.cta}
              <i className="ri-arrow-right-line text-md" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function PartnerResources() {
  return (
    <section className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <SectionHeader
          kicker={content.resources.kicker}
          title={content.resources.title}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {content.resources.items.map((item) => (
            <a
              key={item.title}
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
              className="group relative flex flex-col rounded-md border border-overlay/10 bg-surface-deep/25 p-6 transition-colors duration-500 hover:bg-overlay/[0.018]"
            >
              <ShinyHoverBorder />
              <div className="relative z-10 flex flex-1 flex-col">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-overlay/[0.035] text-2xl text-ink-strong ring-1 ring-overlay/10">
                  <i className={item.icon} />
                </div>
                <h3 className="font-semibold text-ink-strong text-lg">
                  {item.title}
                </h3>
                <p className="mt-2 text-ink-muted text-md leading-relaxed">
                  {item.desc}
                </p>
                <span className="mt-6 inline-flex items-center gap-1.5 font-semibold text-ink-strong text-md">
                  {item.cta}
                  <i className="ri-arrow-right-line text-md transition-transform duration-300 group-hover:translate-x-0.5" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function PartnersPage() {
  return (
    <div className="min-h-screen">
      <JsonLd
        data={pageSchema(
          [{ name: "Partners", path: "/partners" }],
          [faqSchema("/partners", content.faq.items)],
        )}
      />
      <Header />
      <div className="pt-36 pb-20">
        <section className="w-full">
          <PartnersHero />
          <EcosystemLogos />

          <WhyPartner />
          <PartnerPrograms />
          <PartnerEnablement />
          <PartnerBenefits />
          <PartnerStories />
          <PartnerProcess />
          <OtherWays />
          <PartnerResources />
          <PartnerFaq />

          <div className="mt-24 text-center">
            <h2 className="mx-auto max-w-2xl font-normal text-3xl text-ink-strong tracking-tight md:text-4xl">
              {content.cta.title}
            </h2>
            <p className="section-lead mx-auto max-w-2xl">{content.cta.lead}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={content.primaryCtaHref}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-ink-strong px-5 py-2.5 font-semibold text-md text-surface-deep transition-colors hover:bg-ink-strong/90"
              >
                {content.cta.primary}
                <i className="ri-arrow-right-line text-md" />
              </a>
              <a
                href={links.docs}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-overlay/15 bg-overlay/5 px-5 py-2.5 font-semibold text-ink-strong text-md transition-colors hover:bg-overlay/10"
              >
                {content.cta.secondary}
              </a>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
