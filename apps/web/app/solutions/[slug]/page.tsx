import { links } from "@4mica/url";
import Footer from "@components/Footer";
import Header from "@components/Header";
import { createPageMetadata } from "@seo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { SolutionContent, SolutionResourceCard } from "../data";
import { getSolution, solutions } from "../data";

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

type RouteParams = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return solutions.map((solution) => ({ slug: solution.slug }));
}

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const solution = getSolution(slug);
  if (!solution) return {};

  return createPageMetadata({
    title: `4Mica for ${solution.label}`,
    description: solution.intro,
    keywords: [
      "4Mica",
      solution.label,
      "credit-backed payments",
      "instant settlement",
      "x402",
    ],
    url: `/solutions/${solution.slug}`,
    imageAlt: `4Mica for ${solution.label}`,
  });
}

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

function SolutionUseCases({ solution }: { solution: SolutionContent }) {
  return (
    <section className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <SectionHeader
          kicker="Use cases"
          title={`Built for ${solution.label.toLowerCase()} workflows`}
          lead="Give each stakeholder the payment primitives they need: instant authorization, clear limits, and settlement that stays easy to audit."
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {solution.useCases.map((group) => (
            <div
              key={group.label}
              className="overflow-hidden rounded-md border border-white/10 bg-black/25"
            >
              <div className="border-white/10 border-b px-6 py-5">
                <h3 className="font-semibold text-ink-strong text-xl">
                  {group.label}
                </h3>
              </div>
              <div className="divide-y divide-white/10">
                {group.cards.map((card) => (
                  <div
                    key={card.title}
                    className="group relative flex gap-4 p-6 transition-colors duration-500 hover:bg-white/[0.018]"
                  >
                    <ShinyHoverBorder radiusClass="rounded-none" />
                    <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white/[0.035] text-ink-strong ring-1 ring-white/10">
                      <i className={`${card.icon} text-2xl`} />
                    </div>
                    <div className="relative z-10 min-w-0">
                      <h4 className="font-semibold text-ink-strong text-lg">
                        {card.title}
                      </h4>
                      <p className="mt-2 text-ink-muted text-md leading-relaxed">
                        {card.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SolutionProcess({ solution }: { solution: SolutionContent }) {
  return (
    <section className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <SectionHeader
          kicker="Process"
          title={`Start with ${solution.label.toLowerCase()} in 3 steps`}
          lead="The path is deliberately small: configure the payment session, verify each request, then settle the cycle with durable records."
        />

        <ol className="grid grid-cols-1 overflow-hidden rounded-md border border-white/10 bg-black/25 lg:grid-cols-3">
          {solution.process.map((step, index) => (
            <li
              key={step.order}
              className="group relative border-white/10 border-b p-7 transition-colors duration-500 last:border-b-0 hover:bg-white/[0.018] lg:border-r lg:border-b-0 lg:last:border-r-0"
            >
              <ShinyHoverBorder radiusClass="rounded-none" />
              <div className="relative z-10">
                <div className="mb-8 flex items-center justify-between">
                  <span className="font-medium text-5xl text-white/20 leading-none transition-colors duration-500 group-hover:text-white/35">
                    {step.order}
                  </span>
                  <i
                    className={`ri-arrow-right-line hidden text-2xl text-ink-subtle ${
                      index === solution.process.length - 1 ? "" : "lg:block"
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

function ResourceLink({ resource }: { resource: SolutionResourceCard }) {
  const isExternal = resource.href.startsWith("http");

  return (
    <a
      href={resource.href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className="group relative flex min-h-48 flex-col rounded-md border border-white/10 bg-black/25 p-6 transition-colors duration-500 hover:bg-white/[0.018]"
    >
      <ShinyHoverBorder />
      <div className="relative z-10 mb-8 flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white/[0.035] text-ink-strong ring-1 ring-white/10">
          <i className={`${resource.icon} text-2xl`} />
        </div>
        <i className="ri-arrow-right-up-line text-ink-subtle text-xl transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink-body" />
      </div>
      <div className="relative z-10 mt-auto">
        <h3 className="font-semibold text-ink-strong text-xl">
          {resource.title}
        </h3>
        <p className="mt-2 text-ink-muted text-md leading-relaxed">
          {resource.desc}
        </p>
      </div>
    </a>
  );
}

function SolutionResources({ solution }: { solution: SolutionContent }) {
  return (
    <section className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.3fr] lg:items-start">
          <SectionHeader
            kicker="Integrations"
            title="Works with the stack you already use"
            lead="Use 4Mica through x402-compatible HTTP clients, SDKs, protocol docs, and direct rollout support."
            align="left"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {solution.resources.map((resource, index) => (
              <div
                key={resource.title}
                className={index === 0 ? "sm:col-span-2" : undefined}
              >
                <ResourceLink resource={resource} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SolutionFaq({ solution }: { solution: SolutionContent }) {
  return (
    <section id="faq" className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <SectionHeader
          kicker="FAQ"
          title={`Common questions about ${solution.label.toLowerCase()}`}
          align="left"
        />

        <div className="w-full">
          {solution.faqs.map((faq, index) => {
            const isLast = index === solution.faqs.length - 1;

            return (
              <details
                key={faq.question}
                className={`group ${isLast ? "" : "border-white/10 border-b"}`}
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
            Something else on your mind?
          </span>
          <a
            href={links.mailto.support}
            className="text-ink-muted underline underline-offset-4 transition-colors hover:text-ink-strong"
          >
            Contact us
          </a>
        </div>
      </div>
    </section>
  );
}

export default async function SolutionDetailPage({ params }: RouteParams) {
  const { slug } = await params;
  const solution = getSolution(slug);

  if (!solution) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-36 pb-20">
        <section className="w-full">
          {/* Header */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker">Solutions</p>
            <h1 className="section-title text-balance font-normal">
              {solution.headline}
            </h1>
            <p className="section-lead mx-auto max-w-2xl">{solution.intro}</p>
          </div>

          {/* Points — connected block */}
          <div className="mt-14 overflow-hidden rounded-md border border-white/10">
            <div className="grid divide-y divide-white/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              {solution.points.map((point) => (
                <div
                  key={point.title}
                  className="group relative bg-[#0a0a0a] p-8 transition-colors duration-500 hover:bg-[#101010] sm:p-10"
                >
                  <ShinyHoverBorder radiusClass="rounded-none" />
                  <div className="relative z-10">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-white/10 bg-white/5 text-2xl text-white">
                      <i className={point.icon} />
                    </div>
                    <h3 className="font-semibold text-ink-strong text-xl">
                      {point.title}
                    </h3>
                    <p className="mt-3 text-ink-muted text-md leading-relaxed">
                      {point.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <SolutionUseCases solution={solution} />
          <SolutionProcess solution={solution} />
          <SolutionResources solution={solution} />
          <SolutionFaq solution={solution} />

          {/* CTA */}
          <div className="mt-24 text-center">
            <h2 className="mx-auto max-w-2xl font-normal text-3xl text-ink-strong tracking-tight md:text-4xl">
              Ready to build for {solution.label.toLowerCase()}?
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-5 py-2.5 font-semibold text-black text-md transition-colors hover:bg-white/90"
              >
                Start building
                <i className="ri-arrow-right-line text-md" />
              </Link>
              <a
                href={links.mailto.sales}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-5 py-2.5 font-semibold text-ink-strong text-md transition-colors hover:bg-white/10"
              >
                Talk to sales
              </a>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
