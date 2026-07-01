import Footer from "@components/Footer";
import Header from "@components/Header";
import Link from "next/link";
import { messages } from "@/i18n";
import LifeAt4Mica from "./LifeAt4Mica";
import TeamGrid from "./TeamGrid";

const VALUES = messages.team.values;

const PERKS = messages.team.perks;

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

export default function LeadershipPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-36 pb-20">
        <section className="w-full">
          {/* Header */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker">{messages.team.kicker}</p>
            <h1 className="section-title font-normal">{messages.team.title}</h1>
            <p className="section-lead mx-auto max-w-2xl">
              {messages.team.lead}
            </p>
          </div>

          <TeamGrid />

          {/* How we work */}
          <div className="group relative mt-20 w-full overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25 p-8 transition-colors duration-500 hover:bg-overlay/[0.018] sm:p-10">
            <ShinyHoverBorder radiusClass="rounded-md" />
            <div className="relative z-10">
              <h2 className="font-semibold text-2xl text-ink-strong">
                {messages.team.howWeWorkTitle}
              </h2>
              <p className="mt-3 max-w-3xl text-ink-body text-lg leading-relaxed">
                {messages.team.howWeWorkLead}
              </p>
              <div className="mt-6">
                <Link
                  href="/about"
                  className="inline-flex items-center gap-2 font-semibold text-ink-strong text-md transition-colors hover:text-ink-strong"
                >
                  {messages.team.readMission}
                  <i className="ri-arrow-right-line text-md" />
                </Link>
              </div>
            </div>
          </div>

          {/* Our values */}
          <div className="mt-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="section-kicker">{messages.team.valuesKicker}</p>
              <h2 className="section-title font-normal">
                {messages.team.valuesTitle}
              </h2>
              <p className="section-lead mx-auto max-w-2xl">
                {messages.team.valuesLead}
              </p>
            </div>

            <div className="mt-12 overflow-hidden rounded-md border border-overlay/10">
              <div className="grid divide-y divide-overlay/10 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
                {VALUES.map((value) => (
                  <div
                    key={value.title}
                    className="group relative bg-surface p-6 transition-colors duration-500 hover:bg-surface-solid sm:p-8"
                  >
                    <ShinyHoverBorder radiusClass="rounded-none" />
                    <div className="relative z-10">
                      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-overlay/10 bg-overlay/5 text-2xl text-ink-strong">
                        <i className={value.icon} />
                      </div>
                      <h3 className="font-semibold text-ink-strong text-xl">
                        {value.title}
                      </h3>
                      <p className="mt-2 text-ink-muted text-md leading-relaxed">
                        {value.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Perks & benefits */}
          <div className="mt-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="section-kicker">{messages.team.benefitsKicker}</p>
              <h2 className="section-title font-normal">
                {messages.team.benefitsTitle}
              </h2>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PERKS.map((perk) => (
                <div
                  key={perk.title}
                  className="rounded-2xl border border-overlay/5 bg-overlay/3 p-6 transition-colors duration-300 hover:bg-overlay/5"
                >
                  <i className={`${perk.icon} text-2xl ${perk.color}`} />
                  <h3 className="mt-6 font-semibold text-ink-strong text-lg">
                    {perk.title}
                  </h3>
                  <p className="mt-2 text-ink-muted text-md leading-relaxed">
                    {perk.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Life at 4Mica */}
          <LifeAt4Mica />
        </section>
      </div>
      <Footer />
    </div>
  );
}
