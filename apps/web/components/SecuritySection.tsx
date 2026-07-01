"use client";

import { messages } from "@/i18n";
import { SECURITY_POINTS } from "./data";
export default function SecuritySection() {
  return (
    <section id="security" className="section-gloss py-24">
      <div className="w-full">
        <div className="mx-auto max-w-4xl">
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            {/* Left */}
            <div>
              <p className="section-kicker">
                {messages.sharedContent.sections.security.kicker}
              </p>
              <h2 className="section-title">
                {messages.sharedContent.sections.security.title}
              </h2>
              <p className="section-lead">
                {messages.sharedContent.sections.security.lead}
              </p>
              <div
                className="glass-panel mt-6 rounded-md px-5 py-4"
                style={{ borderColor: "rgb(74 222 128 / 0.28)" }}
              >
                <p className="font-semibold text-ink-strong text-md">
                  {messages.sharedContent.sections.security.cardTitle}
                </p>
                <p className="mt-1.5 text-ink-muted text-md leading-relaxed">
                  {messages.sharedContent.sections.security.cardLead}
                </p>
              </div>
            </div>

            {/* Right */}
            <div className="space-y-4">
              {SECURITY_POINTS.map((pt) => (
                <div
                  key={pt.label}
                  className="glass-panel flex items-start gap-4 rounded-md px-5 py-4"
                  style={{ borderColor: `${pt.color}32` }}
                >
                  <div
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                    style={{ background: `${pt.color}22` }}
                  >
                    <i
                      className={`${pt.icon} text-md`}
                      style={{ color: pt.color }}
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-ink-strong text-md">
                      {pt.label}
                    </p>
                    <p className="mt-1 text-ink-muted text-md leading-relaxed">
                      {pt.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
