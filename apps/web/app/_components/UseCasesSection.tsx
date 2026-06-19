"use client";

import { USE_CASES } from "../data";

export default function UseCasesSection() {
  return (
    <section id="use-cases" className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <div className="mb-16 text-center">
          <p className="section-kicker">Use cases</p>
          <h2 className="section-title font-normal">
            Built for the scale you need
          </h2>
          <p className="section-lead mx-auto max-w-xl">
            API monetization, agentic commerce, paywalled content. 4Mica handles
            the payment layer so you don&apos;t have to.
          </p>
        </div>

        <div className="grid w-full grid-cols-1 overflow-hidden rounded-md border border-white/10 bg-black/25 md:grid-cols-2">
          {USE_CASES.map((uc, index) => {
            const hoverRadius =
              index === 0
                ? "rounded-t-md md:rounded-tr-none"
                : index === 1
                  ? "md:rounded-tr-md"
                  : index === USE_CASES.length - 2
                    ? "md:rounded-bl-md"
                    : index === USE_CASES.length - 1
                      ? "rounded-b-md md:rounded-bl-none"
                      : "";

            return (
              <div
                key={uc.title}
                className="group relative flex min-w-0 flex-col gap-4 border-white/10 border-b p-6 transition-colors duration-500 hover:bg-white/[0.018] sm:p-7 md:nth-last-[-n+2]:border-b-0 md:odd:border-r"
              >
                <div
                  className={`pointer-events-none absolute inset-0 z-20 border border-white/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${hoverRadius}`}
                />
                <div
                  className={`pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${hoverRadius}`}
                  style={{
                    padding: "1px",
                    background:
                      "linear-gradient(115deg, rgba(255,255,255,0), rgba(255,255,255,0.32), rgba(255,255,255,0.04), rgba(255,255,255,0))",
                    mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                    maskComposite: "exclude",
                    WebkitMask:
                      "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                    WebkitMaskComposite: "xor",
                  }}
                />
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-white/[0.035] text-ink-strong ring-1 ring-white/10 transition-colors duration-500 group-hover:bg-white/6 group-hover:ring-white/15">
                    <i className={`${uc.icon} text-3xl`} />
                  </div>
                  <span className="text-right font-medium text-ink-muted text-md uppercase tracking-widest transition-colors duration-500 group-hover:text-ink-body">
                    {uc.kicker}
                  </span>
                </div>

                <div>
                  <h3 className="font-medium text-ink-strong text-xl">
                    {uc.title}
                  </h3>
                  <p className="mt-2 text-ink-muted text-md leading-relaxed transition-colors duration-500 group-hover:text-ink-body">
                    {uc.desc}
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  {uc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-white/10 bg-white/2.5 px-2 py-0.5 font-medium text-ink-muted text-md transition-colors duration-500 group-hover:border-white/15 group-hover:text-ink-body"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
