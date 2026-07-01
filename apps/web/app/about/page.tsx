import Footer from "@components/Footer";
import Header from "@components/Header";
import Image from "next/image";
import Link from "next/link";
import { messages } from "@/i18n";
import { teamMembers } from "../team/data";
import TimelineSection from "./_components/TimelineSection";
import { companyInfo, highlights } from "./data";
import ViewOpenRolesButton from "./ViewOpenRolesButton";

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

export default function AboutPage() {
  const founders = teamMembers.slice(0, 2);
  const [ceo, cto] = founders;

  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-64 pb-20">
        <section className="w-full">
          {/* Header */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker">{messages.about.kicker}</p>
            <h1 className="section-title font-normal">
              {messages.about.title}
            </h1>
          </div>

          {/* Mission + highlights + company info — one connected block */}
          <div className="mt-14 overflow-hidden rounded-md border border-overlay/10">
            <div className="flex flex-col divide-y divide-overlay/10">
              {/* Mission card */}
              <div className="group relative overflow-hidden bg-surface p-8 transition-colors duration-500 hover:bg-surface-solid sm:p-12">
                {/* Decorative glow */}
                <div
                  className="pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full blur-3xl transition-opacity duration-500 group-hover:opacity-80"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(255,255,255,0.18), rgba(255,255,255,0))",
                  }}
                />
                <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:gap-8">
                  <div className="max-w-4xl">
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-overlay/10 bg-overlay/5 px-3 py-1 text-ink-muted text-md uppercase tracking-widest">
                      <i className="ri-focus-3-line text-ink-strong" />
                      {messages.about.whyWeExist}
                    </div>
                    <p className="text-left text-xl leading-relaxed sm:text-2xl">
                      <span className="font-medium text-ink-strong">
                        {messages.about.missionStrong}
                      </span>{" "}
                      <span className="text-ink-muted">
                        {messages.about.missionBody}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Highlights */}
              <div className="grid sm:grid-cols-2">
                {highlights.map((highlight, i) => (
                  <div
                    key={highlight.title}
                    className={`group relative border-overlay/10 bg-surface p-8 transition-colors duration-500 hover:bg-surface-solid sm:p-10 ${
                      i > 0 ? "border-t" : ""
                    } ${i > 0 && i < 2 ? "sm:border-t-0" : ""} ${
                      i % 2 === 1 ? "sm:border-l" : ""
                    }`}
                  >
                    <ShinyHoverBorder radiusClass="rounded-none" />
                    <div className="relative z-10">
                      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-overlay/10 bg-overlay/5 text-2xl text-ink-strong transition-colors duration-500 group-hover:text-ink-strong">
                        <i className={highlight.icon} />
                      </div>
                      <h3 className="font-semibold text-ink-strong text-xl">
                        {highlight.title}
                      </h3>
                      <p className="mt-3 text-ink-muted text-lg leading-relaxed">
                        {highlight.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Company info */}
              <div className="group relative bg-surface p-8 transition-colors duration-500 hover:bg-surface-solid sm:p-10">
                <ShinyHoverBorder radiusClass="rounded-none" />
                <div className="relative z-10">
                  <h2 className="font-semibold text-2xl text-ink-strong">
                    {messages.about.companyInfoTitle}
                  </h2>
                  <div className="mt-8 grid grid-cols-2 gap-x-12 gap-y-6">
                    {companyInfo.map((item) => (
                      <div key={item.label} className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-overlay/10 bg-overlay/5 text-ink-strong text-xl">
                          <i className={item.icon} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-ink-muted text-md">
                            {item.label}
                          </span>
                          <span className="text-ink-body text-lg">
                            {item.value}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Roadmap */}
          <TimelineSection />

          {/* Founders */}
          {ceo && cto && (
            <div className="mt-24">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="font-normal text-3xl text-ink-strong tracking-tight md:text-4xl">
                  {messages.about.founderTitle}
                </h2>
                <p className="mt-4 text-ink-muted text-md leading-relaxed md:text-lg">
                  {messages.about.founderLead}
                </p>
              </div>

              <div className="group relative mt-12 w-full overflow-hidden rounded-3xl border border-overlay/10 bg-surface-deep/25 px-6 py-12 transition-colors duration-500 hover:bg-overlay/[0.018] sm:px-10 sm:py-14">
                <ShinyHoverBorder radiusClass="rounded-3xl" />
                <div className="relative z-10 text-center">
                  <p className="mx-auto max-w-3xl text-ink-body text-lg leading-relaxed sm:text-xl">
                    We&apos;re{" "}
                    <span className="font-medium text-ink-strong">
                      {ceo.name.split(" ")[0]}
                    </span>{" "}
                    and{" "}
                    <span className="font-medium text-ink-strong">
                      {cto.name.split(" ")[0]}
                    </span>
                    . {messages.about.founderQuote}
                  </p>

                  <div className="mt-10 flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-8">
                    <div className="flex flex-col items-center gap-0.5 sm:items-end sm:text-right">
                      <span className="font-semibold text-ink-strong text-md">
                        {ceo.name}
                      </span>
                      <span className="text-ink-muted text-md">{ceo.role}</span>
                    </div>

                    <div className="flex items-center -space-x-3">
                      {founders.map((founder, index) => (
                        <span
                          key={founder.name}
                          className={`relative inline-flex h-14 w-14 overflow-hidden rounded-full border-2 border-overlay/15 bg-overlay/5 ${
                            index === 0 ? "z-10" : "z-20"
                          }`}
                        >
                          <Image
                            src={founder.image}
                            alt={founder.name}
                            width={56}
                            height={56}
                            className="h-full w-full object-cover"
                            style={{
                              objectPosition:
                                founder.imagePosition ?? "50% 20%",
                            }}
                          />
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-col items-center gap-0.5 sm:items-start sm:text-left">
                      <span className="font-semibold text-ink-strong text-md">
                        {cto.name}
                      </span>
                      <span className="text-ink-muted text-md">{cto.role}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Careers CTA */}
          <div className="mt-24 text-center">
            <h2 className="mx-auto max-w-2xl font-normal text-3xl text-ink-strong tracking-tight md:text-4xl">
              {messages.about.careersTitle}
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ViewOpenRolesButton />
              <Link
                href="/team"
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-ink-strong px-5 py-2.5 font-semibold text-md text-surface-deep transition-colors hover:bg-ink-strong/90"
              >
                {messages.common.actions.meetTheTeam}
              </Link>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  );
}
