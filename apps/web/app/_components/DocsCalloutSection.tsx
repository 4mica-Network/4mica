import { highlight } from "@lib/shiki";
import { messages } from "@/i18n";
import { STEPS } from "../data";

export default async function DocsCalloutSection() {
  const highlighted = await Promise.all(
    STEPS.map((step) => highlight(step.code, "typescript")),
  );

  return (
    <section id="how-it-works" className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <div className="w-full overflow-hidden rounded-md border border-overlay/10 bg-surface">
          <div className="border-overlay/10 border-b px-6 py-8 text-left sm:px-8">
            <p className="section-kicker">
              {messages.home.sections.howItWorksKicker}
            </p>
            <h3 className="mt-4 max-w-3xl font-normal text-3xl text-ink-strong tracking-tight md:text-5xl">
              {messages.home.sections.howItWorksTitle}
            </h3>
            <p className="mt-4 max-w-xl text-ink-body text-md leading-relaxed md:text-md">
              {messages.home.sections.howItWorksLead}
            </p>
          </div>

          {STEPS.map((step, i) => (
            <div
              key={step.num}
              className="group relative border-overlay/10 border-b transition-colors duration-500 last:border-b-0 hover:bg-overlay/[0.018]"
            >
              <div className="pointer-events-none absolute inset-0 z-20 border border-overlay/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div
                className="pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
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
              <div className="relative z-10 grid gap-0 lg:grid-cols-[1fr_1.2fr]">
                {/* Left */}
                <div className="flex min-w-0 flex-col justify-between border-overlay/10 border-b p-6 sm:p-8 lg:border-r lg:border-b-0">
                  <div>
                    <div className="mb-5 flex items-baseline gap-4">
                      <span className="font-medium text-4xl text-ink-strong/20 leading-none transition-colors duration-500 group-hover:text-ink-strong/35">
                        {step.num}
                      </span>
                      <span className="font-medium text-ink-muted text-md uppercase tracking-widest transition-colors duration-500 group-hover:text-ink-body">
                        {step.badge}
                      </span>
                    </div>
                    <h3 className="font-medium text-ink-strong text-xl">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-ink-muted text-md leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>

                {/* Right */}
                <div className="min-w-0 bg-[#101010] p-5 transition-colors duration-500 group-hover:bg-[#141414] sm:p-6">
                  <div className="mb-4 flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-md bg-[#ff5555]/70" />
                    <div className="h-2 w-2 rounded-md bg-[#f1fa8c]/70" />
                    <div className="h-2 w-2 rounded-md bg-[#50fa7b]/70" />
                  </div>
                  <div
                    className="shiki-code overflow-x-auto font-mono text-md leading-6"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki escapes source text at build time; html contains only its own token markup.
                    dangerouslySetInnerHTML={{ __html: highlighted[i] }}
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="flex w-full flex-col items-start justify-start gap-5 px-6 py-8 text-left sm:flex-row sm:px-8">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center text-ink-strong">
              <i className="ri-exchange-dollar-line text-5xl" />
            </div>

            <div>
              <p className="mb-2 text-ink-muted text-md">
                {messages.home.sections.howItWorksProtocolNote}
              </p>
              <p className="flex max-w-4xl flex-col gap-1 font-medium text-ink-strong text-xl leading-tight sm:flex-row sm:items-baseline sm:gap-3 md:text-2xl">
                <span>{messages.home.sections.replaceTransactions}</span>
                <span className="hidden text-ink-subtle/60 text-lg sm:inline">
                  /
                </span>
                <span>{messages.home.sections.oneSettlement}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
