import { links, routes } from "@4mica/url";
import Footer from "@components/Footer";
import Header from "@components/Header";
import { createPageMetadata } from "@seo/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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

          {/* CTA */}
          <div className="mt-24 text-center">
            <h2 className="mx-auto max-w-2xl font-normal text-3xl text-ink-strong tracking-tight md:text-4xl">
              Ready to build for {solution.label.toLowerCase()}?
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={routes.technicalDocs}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-5 py-2.5 font-semibold text-black text-md transition-colors hover:bg-white/90"
              >
                Start building
                <i className="ri-arrow-right-line text-md" />
              </Link>
              <a
                href={links.mailto.contact}
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
