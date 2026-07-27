import { cn } from "@4mica/ui";
import { links } from "@4mica/url";
import Footer from "@components/Footer";
import Header from "@components/Header";
import JsonLd from "@components/JsonLd";
import SectionBackdrop from "@components/SectionBackdrop";
import ShinyHoverBorder from "@components/ShinyHoverBorder";
import { metaFor } from "@seo/pages";
import { faqSchema, pageSchema } from "@seo/structuredData";
import Link from "next/link";
import { messages } from "@/i18n";
import SavingsCalculator from "./SavingsCalculator";

export const metadata = metaFor("/pricing");

const content = messages.pricing;

// A single rhythm for the gap between sections, so every subject change gets
// the same pause. Scales with the viewport: tight on phones, generous on
// desktop where the eye has further to travel.
const SECTION_GAP = "mt-28 sm:mt-36 lg:mt-44";

function SectionHeader({
  kicker,
  title,
  lead,
  align = "left",
}: {
  kicker: string;
  title: string;
  lead?: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={
        align === "center"
          ? "mb-14 text-center lg:mb-16"
          : "mb-12 max-w-2xl text-left lg:mb-14"
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

function AudienceSection() {
  return (
    <section className={SECTION_GAP}>
      <SectionHeader
        kicker={content.audience.kicker}
        title={content.audience.title}
        lead={content.audience.lead}
      />

      <div className="overflow-hidden rounded-md border border-overlay/10">
        <div className="grid divide-y divide-overlay/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {content.audience.cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className={`group relative flex flex-col p-8 transition-colors duration-500 ${
                "primary" in card && card.primary
                  ? "bg-surface-solid hover:bg-surface"
                  : "bg-surface hover:bg-surface-solid"
              }`}
            >
              <ShinyHoverBorder radiusClass="rounded-none" />
              <div className="relative z-10 flex flex-1 flex-col">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-md border border-overlay/10 bg-overlay/5 text-2xl text-ink-strong">
                    <i className={card.icon} />
                  </div>
                  {"primary" in card && card.primary ? (
                    <span className="rounded-full border border-overlay/20 bg-overlay/10 px-2.5 py-0.5 text-ink-strong text-md">
                      {content.audience.primaryBadge}
                    </span>
                  ) : null}
                </div>

                <p className="font-medium text-ink-muted text-md uppercase tracking-widest">
                  {card.label}
                </p>
                <h3 className="mt-2 font-semibold text-ink-strong text-xl">
                  {card.title}
                </h3>
                <p className="mt-3 text-ink-muted text-md leading-relaxed">
                  {card.desc}
                </p>

                <div className="mt-auto pt-6">
                  <p className="text-ink-subtle text-md uppercase tracking-wider">
                    {card.driver}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1.5 font-semibold text-ink-strong text-md">
                    {card.label}
                    <i className="ri-arrow-right-line text-md transition-transform duration-300 group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 flex gap-3 rounded-md border border-overlay/10 bg-surface-deep/25 px-6 py-5">
        <i
          className="ri-robot-2-line mt-0.5 shrink-0 text-ink-subtle text-xl"
          aria-hidden="true"
        />
        <p className="text-ink-muted text-md leading-relaxed">
          {content.audience.agentsNote}
        </p>
      </div>
    </section>
  );
}

function PricingModel() {
  return (
    <section className={SECTION_GAP}>
      <SectionHeader
        kicker={content.model.kicker}
        title={content.model.title}
        lead={content.model.lead}
      />

      <div className="overflow-hidden rounded-md border border-overlay/10">
        <div className="grid divide-y divide-overlay/10 sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
          {content.model.cards.map((card) => (
            <div
              key={card.title}
              className="group relative bg-surface p-8 transition-colors duration-500 hover:bg-surface-solid"
            >
              <ShinyHoverBorder radiusClass="rounded-none" />
              <div className="relative z-10">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-overlay/10 bg-overlay/5 text-2xl text-ink-strong">
                  <i className={card.icon} />
                </div>
                <h3 className="font-semibold text-ink-strong text-lg">
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
    </section>
  );
}

function FeeBreakdown() {
  return (
    <section className={SECTION_GAP}>
      <SectionHeader
        kicker={content.fee.kicker}
        title={content.fee.title}
        lead={content.fee.lead}
      />

      <div className="overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25">
        <div className="border-overlay/10 border-b px-6 py-8 text-center sm:px-8">
          <p className="font-medium text-ink-strong text-xl md:text-2xl">
            {content.fee.formula}
          </p>
        </div>

        <ol className="grid grid-cols-1 lg:grid-cols-3">
          {content.fee.steps.map((step, index) => (
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
                      index === content.fee.steps.length - 1 ? "" : "lg:block"
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

        <ul className="divide-y divide-overlay/10 border-overlay/10 border-t">
          {content.fee.notes.map((note) => (
            <li key={note} className="flex gap-3 px-7 py-4">
              <i
                className="ri-information-line mt-0.5 shrink-0 text-ink-subtle"
                aria-hidden="true"
              />
              <span className="text-ink-muted text-md leading-relaxed">
                {note}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FacilitatorSavings() {
  return (
    <section
      className={cn(SECTION_GAP, "relative isolate overflow-hidden rounded-md")}
    >
      <SectionBackdrop src="/bg/abstract-marble.avif" position="right" />
      <SectionHeader
        kicker={content.facilitators.kicker}
        title={content.facilitators.title}
        lead={content.facilitators.lead}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="rounded-md border border-overlay/10 bg-surface-deep/25 p-8">
          <p className="font-medium text-ink-strong text-xl">
            {content.facilitators.example.title}
          </p>

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-md border border-overlay/10 bg-overlay/3 px-4 py-3">
              <span className="text-ink-muted text-md">
                {content.facilitators.example.outgoing}
              </span>
              <span className="font-medium text-ink-strong tabular-nums">
                40
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border border-overlay/10 bg-overlay/3 px-4 py-3">
              <span className="text-ink-muted text-md">
                {content.facilitators.example.incoming}
              </span>
              <span className="font-medium text-ink-strong tabular-nums">
                27
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border border-overlay/25 bg-overlay/6 px-4 py-3">
              <span className="text-ink-strong text-md">
                {content.facilitators.example.net}
              </span>
              <span className="font-semibold text-ink-strong text-lg tabular-nums">
                13
              </span>
            </div>
          </div>

          <p className="mt-6 text-ink-muted text-md leading-relaxed">
            {content.facilitators.example.note}
          </p>
        </div>

        <div className="overflow-hidden rounded-md">
          <div>
            {content.facilitators.points.map((point) => (
              <div
                key={point.title}
                className="group relative flex gap-4 p-6 transition-colors duration-500 hover:bg-overlay/[0.018]"
              >
                {/* <ShinyHoverBorder radiusClass="rounded-none" /> */}
                <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-overlay/[0.035] text-ink-strong ring-1 ring-overlay/10">
                  <i className={`${point.icon} text-2xl`} />
                </div>
                <div className="relative z-10 min-w-0">
                  <h3 className="font-semibold text-ink-strong text-lg">
                    {point.title}
                  </h3>
                  <p className="mt-2 text-ink-muted text-md leading-relaxed">
                    {point.desc}
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

function YieldSection() {
  return (
    <section className={SECTION_GAP}>
      <SectionHeader
        kicker={content.yieldSection.kicker}
        title={content.yieldSection.title}
        lead={content.yieldSection.lead}
      />

      <div className="grid grid-cols-1 overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25 sm:grid-cols-2 lg:grid-cols-4">
        {content.yieldSection.points.map((point) => (
          <div
            key={point.title}
            className="group relative border-overlay/10 border-b p-6 transition-colors duration-500 hover:bg-overlay/[0.018] sm:nth-last-[-n+2]:border-b-0 sm:odd:border-r lg:border-r lg:border-b-0 lg:last:border-r-0"
          >
            <ShinyHoverBorder radiusClass="rounded-none" />
            <div className="relative z-10">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-overlay/10 bg-overlay/5 text-2xl text-ink-strong">
                <i className={point.icon} />
              </div>
              <h3 className="font-semibold text-ink-strong text-lg">
                {point.title}
              </h3>
              <p className="mt-2 text-ink-muted text-md leading-relaxed">
                {point.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function VolumePricing() {
  return (
    <section className={SECTION_GAP}>
      <div className="grid gap-8 rounded-md border border-overlay/10 bg-surface-deep/25 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
        <div>
          <p className="section-kicker">{content.volume.kicker}</p>
          <h2 className="section-title font-normal">{content.volume.title}</h2>
          <p className="section-lead max-w-xl">{content.volume.lead}</p>
          <a
            href={links.mailto.sales}
            className="mt-8 inline-flex items-center justify-center gap-1.5 rounded-md bg-ink-strong px-5 py-2.5 font-semibold text-md text-surface-deep transition-colors hover:bg-ink-strong/90"
          >
            {content.volume.cta}
            <i className="ri-arrow-right-line text-md" />
          </a>
        </div>

        <ul className="space-y-3">
          {content.volume.points.map((point) => (
            <li key={point} className="flex gap-3">
              <i
                className="ri-check-line mt-0.5 shrink-0 text-ink-strong/60"
                aria-hidden="true"
              />
              <span className="text-ink-body text-md leading-relaxed">
                {point}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PricingFaq() {
  return (
    <section id="faq" className={SECTION_GAP}>
      <SectionHeader kicker={content.faqKicker} title={content.faqTitle} />

      <div className="w-full">
        {content.faqs.map((faq, index) => {
          const isLast = index === content.faqs.length - 1;

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
    </section>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <JsonLd
        data={pageSchema(
          [{ name: "Pricing", path: "/pricing" }],
          [faqSchema("/pricing", content.faqs)],
        )}
      />
      <Header />
      <div className="pt-18 pb-32">
        <section className="w-full">
          <AudienceSection />
          <FacilitatorSavings />
          <PricingModel />
          <FeeBreakdown />

          <section className={cn(SECTION_GAP, "px-4 pt-6 sm:px-6 lg:px-8")}>
            <SectionHeader
              kicker={content.calculator.kicker}
              title={content.calculator.title}
              lead={content.calculator.lead}
            />
            <SavingsCalculator />
          </section>

          <YieldSection />
          <VolumePricing />
          <section className={SECTION_GAP}>
            <SectionHeader
              kicker={content.includedKicker}
              title={content.includedTitle}
              lead={content.includedLead}
            />

            <div className="grid grid-cols-1 overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25 sm:grid-cols-2 lg:grid-cols-4">
              {content.included.map((item) => (
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

            <p className="mt-8 text-center text-ink-subtle text-md">
              {content.collateralNote}
            </p>
          </section>

          <PricingFaq />
        </section>
      </div>
      <Footer />
    </div>
  );
}
