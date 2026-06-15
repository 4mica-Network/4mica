"use client";

import { USE_CASES } from "../data";

const BLUE = "#7bcbff";

export default function UseCasesSection() {
  return (
    <section id="use-cases" className="section-gloss py-24">
      <div className="container mx-auto px-6">
        <div className="mb-16 text-center">
          <p className="section-kicker">Use cases</p>
          <h2 className="section-title">Built for the scale you need</h2>
          <p className="section-lead mx-auto max-w-xl">
            API monetization, agentic commerce, paywalled content. 4Mica handles
            the payment layer so you don&apos;t have to.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2">
          {USE_CASES.map((uc) => (
            <div
              key={uc.title}
              className="glass-panel flex flex-col gap-4 rounded-2xl p-6 sm:p-7"
              style={{ borderColor: `${BLUE}28` }}
            >
              <div className="flex items-start justify-between">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: `${BLUE}1a` }}
                >
                  <i className={`${uc.icon} text-lg`} style={{ color: BLUE }} />
                </div>
                <span
                  className="font-semibold text-xs uppercase tracking-widest"
                  style={{ color: `${BLUE}bb` }}
                >
                  {uc.kicker}
                </span>
              </div>

              <div>
                <h3 className="font-semibold text-base text-ink-strong">
                  {uc.title}
                </h3>
                <p className="mt-2 text-ink-muted text-sm leading-relaxed">
                  {uc.desc}
                </p>
              </div>

              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                {uc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-2 py-0.5 font-medium text-[11px]"
                    style={{
                      background: `${BLUE}14`,
                      color: `${BLUE}cc`,
                      border: `1px solid ${BLUE}30`,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
