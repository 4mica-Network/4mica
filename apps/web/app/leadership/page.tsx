import Footer from "@components/Footer";
import Header from "@components/Header";
import Link from "next/link";
import LifeAt4Mica from "./LifeAt4Mica";
import TeamGrid from "./TeamGrid";

const VALUES = [
  {
    title: "Relentless",
    icon: "ri-fire-line",
    desc: "We push through hard problems and don't stop until it ships.",
  },
  {
    title: "Open",
    icon: "ri-eye-line",
    desc: "We default to transparency, open standards, and honest feedback.",
  },
  {
    title: "Delightful",
    icon: "ri-sparkling-2-line",
    desc: "We obsess over the details that make every interaction effortless.",
  },
  {
    title: "Unified",
    icon: "ri-team-line",
    desc: "We move as one team with shared goals and shared ownership.",
  },
  {
    title: "Innovative",
    icon: "ri-lightbulb-flash-line",
    desc: "We question defaults and build what doesn't exist yet.",
  },
];

const PERKS = [
  {
    title: "Competitive equity",
    icon: "ri-money-dollar-circle-fill",
    color: "text-purple-400",
    desc: "We pay well and we pay fairly, with transparent compensation practices.",
  },
  {
    title: "Health benefits",
    icon: "ri-heart-pulse-fill",
    color: "text-pink-400",
    desc: "We've got you covered with comprehensive health, dental, and vision plans.",
  },
  {
    title: "Equipment & office",
    icon: "ri-computer-fill",
    color: "text-blue-400",
    desc: "You get a laptop, of course, plus an additional $1,000 USD to upgrade your home office.",
  },
  {
    title: "Flexible time-off",
    icon: "ri-time-fill",
    color: "text-green-400",
    desc: "Unlimited PTO and sick leave. When you work, we pay. When you don't work, we still pay.",
  },
  {
    title: "Retirement benefits",
    icon: "ri-bank-fill",
    color: "text-sky-400",
    desc: "We offer retirement support with coverage varying by country.",
  },
  {
    title: "Paid leave",
    icon: "ri-user-fill",
    color: "text-yellow-400",
    desc: "Time off to help you rest, care for loved ones, or welcome a new addition to your family.",
  },
  {
    title: "L&D stipend",
    icon: "ri-book-open-fill",
    color: "text-pink-300",
    desc: "Get $3,000 USD per year towards your professional learning and development.",
  },
  {
    title: "Wellness stipend",
    icon: "ri-settings-4-fill",
    color: "text-orange-500",
    desc: "Get $200 USD a month for a gym membership, new shoes, or the world's largest smoothie.",
  },
];

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

export default function LeadershipPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="pt-36 pb-20">
        <section className="w-full">
          {/* Header */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-kicker">Team</p>
            <h1 className="section-title font-normal">Meet the team</h1>
            <p className="section-lead mx-auto max-w-2xl">
              4Mica is led by founders who have shipped payment infrastructure
              across finance, AI, and cryptography. We are focused on bringing
              production-grade credit rails to web3 commerce.
            </p>
          </div>

          <TeamGrid />

          {/* How we work */}
          <div className="group relative mt-20 w-full overflow-hidden rounded-md border border-white/10 bg-black/25 p-8 transition-colors duration-500 hover:bg-white/[0.018] sm:p-10">
            <ShinyHoverBorder radiusClass="rounded-md" />
            <div className="relative z-10">
              <h2 className="font-semibold text-2xl text-ink-strong">
                How we work
              </h2>
              <p className="mt-3 max-w-3xl text-ink-body text-lg leading-relaxed">
                We build with a security-first mindset and keep every protocol
                component auditable. The team ships with a focus on production
                reliability, clear integration paths, and measurable outcomes
                for partners.
              </p>
              <div className="mt-6">
                <Link
                  href="/about"
                  className="inline-flex items-center gap-2 font-semibold text-ink-strong text-md transition-colors hover:text-white"
                >
                  Read our mission
                  <i className="ri-arrow-right-line text-md" />
                </Link>
              </div>
            </div>
          </div>

          {/* Our values */}
          <div className="mt-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="section-kicker">Values</p>
              <h2 className="section-title font-normal">Our values</h2>
              <p className="section-lead mx-auto max-w-2xl">
                The principles that guide how we build and work together.
              </p>
            </div>

            <div className="mt-12 overflow-hidden rounded-md border border-white/10">
              <div className="grid divide-y divide-white/10 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
                {VALUES.map((value) => (
                  <div
                    key={value.title}
                    className="group relative bg-[#0a0a0a] p-6 transition-colors duration-500 hover:bg-[#101010] sm:p-8"
                  >
                    <ShinyHoverBorder radiusClass="rounded-none" />
                    <div className="relative z-10">
                      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-white/10 bg-white/5 text-2xl text-white">
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
              <p className="section-kicker">Benefits</p>
              <h2 className="section-title font-normal">
                Perks &amp; benefits
              </h2>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PERKS.map((perk) => (
                <div
                  key={perk.title}
                  className="rounded-2xl border border-white/5 bg-white/3 p-6 transition-colors duration-300 hover:bg-white/5"
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
