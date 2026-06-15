"use client";

import { milestones } from "../data";

type TimelineSectionProps = {
  showHeader?: boolean;
};

export default function TimelineSection({
  showHeader = true,
}: TimelineSectionProps) {
  return (
    <section id="roadmap" className="section-gloss py-20">
      <div className="w-full">
        {showHeader && (
          <div className="mb-16 text-center">
            <h2 className="section-title mb-6">Product Roadmap</h2>
            <div className="mx-auto mb-8 accent-bar"></div>
            <p className="section-lead mx-auto max-w-2xl">
              Our journey to revolutionize web3 commerce
            </p>
          </div>
        )}

        <div className="mx-auto max-w-4xl">
          <div className="relative">
            <div className="absolute left-1/2 hidden h-full w-1 -translate-x-1/2 transform bg-brand-strong/60 md:block"></div>

            {milestones.map((milestone, index) => (
              <div
                key={milestone.quarter}
                className={`relative mb-12 flex items-center ${index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"} flex-col`}
              >
                <div className="mb-4 md:mb-0 md:w-1/2 md:px-8">
                  <div
                    className={`glass-panel rounded-md p-6 ${index % 2 === 0 ? "md:text-right" : "md:text-left"} text-center`}
                  >
                    <h3 className="mb-2 font-bold text-2xl text-ink-strong">
                      {milestone.title}
                    </h3>
                    <p className="text-ink-body leading-relaxed">
                      {milestone.description}
                    </p>
                  </div>
                </div>

                <div
                  className={`absolute left-1/2 flex hidden h-12 w-12 -translate-x-1/2 transform items-center justify-center rounded-md border-4 border-white/20 font-bold text-sm shadow-lg md:flex ${
                    milestone.done
                      ? "bg-emerald-500 text-white"
                      : "bg-brand-violet text-white"
                  }`}
                >
                  {index + 1}
                </div>

                <div className="md:w-1/2 md:px-8">
                  <div
                    className={`${index % 2 === 0 ? "md:text-left" : "md:text-right"} text-center`}
                  >
                    <span className="inline-block rounded-md bg-brand-deep px-4 py-2 font-semibold text-ink">
                      {milestone.quarter}
                    </span>
                  </div>
                </div>

                <div
                  className={`mt-4 flex h-8 w-8 items-center justify-center rounded-md font-bold text-sm md:hidden ${
                    milestone.done
                      ? "bg-emerald-500 text-white"
                      : "bg-brand-violet text-white"
                  }`}
                >
                  {index + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
