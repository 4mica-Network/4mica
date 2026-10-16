import { highlight } from "@lib/shiki";
import { messages } from "@/i18n";
import { STEPS } from "../data";
import HowItWorksSteps from "./HowItWorksSteps";

export default async function HowItWorksSection() {
  const html = await Promise.all(
    STEPS.map((step) => highlight(step.code, "typescript")),
  );

  return (
    <section id="how-it-works" className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <div className="mb-12 text-center">
          <p className="section-kicker">
            {messages.home.sections.howItWorksKicker}
          </p>
          <h2 className="section-title font-normal text-[1.75rem] leading-tight md:text-5xl">
            {messages.home.sections.howItWorksTitle}
          </h2>
          <p className="section-lead mx-auto max-w-xl">
            {messages.home.sections.howItWorksLead}
          </p>
        </div>

        <HowItWorksSteps html={html} />

        <p className="mt-8 text-center text-ink-muted text-md">
          {messages.home.sections.howItWorksProtocolNote}
        </p>
      </div>
    </section>
  );
}
