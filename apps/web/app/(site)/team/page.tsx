import Footer from "@components/Footer";
import Header from "@components/Header";
import ShinyHoverBorder from "@components/ShinyHoverBorder";
import Link from "next/link";
import { messages } from "@/i18n";
import PhotoCollage from "./PhotoCollage";
import TeamGrid from "./TeamGrid";

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

          {/* Photo collage */}
          <PhotoCollage />
        </section>
      </div>
      <Footer />
    </div>
  );
}
