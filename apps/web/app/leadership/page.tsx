import Footer from "@components/Footer";
import Header from "@components/Header";
import Link from "next/link";
import TeamGrid from "./TeamGrid";

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
          <div className="group relative mt-20 w-full overflow-hidden rounded-3xl border border-white/10 bg-black/25 p-8 transition-colors duration-500 hover:bg-white/[0.018] sm:p-10">
            <ShinyHoverBorder radiusClass="rounded-3xl" />
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
        </section>
      </div>
      <Footer />
    </div>
  );
}
