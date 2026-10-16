import { messages } from "@/i18n";
import HowItWorksSteps from "./HowItWorksSteps";

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <div className="mb-12 text-center">
          <p className="section-kicker">{messages.home.sections.stackKicker}</p>
          <h2 className="section-title font-normal text-[1.75rem] leading-tight md:text-5xl">
            {messages.home.sections.stackTitle}
          </h2>
          <p className="section-lead mx-auto max-w-xl">
            {messages.home.sections.stackLead}
          </p>
        </div>

        <HowItWorksSteps />

        <p className="mt-8 text-center text-ink-muted text-md">
          {messages.home.sections.howItWorksProtocolNote}
        </p>
      </div>
    </section>
  );
}
