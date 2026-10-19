"use client";

import SectionBackdrop from "@components/SectionBackdrop";
import { useEffect, useRef } from "react";
import { messages } from "@/i18n";
import { TRUST_POINTS } from "../data";
import PrimitivesPipeline from "./PrimitivesPipeline";

export default function PartnersSection() {
  const orbitRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = orbitRef.current;
    if (!svg || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          svg.unpauseAnimations();
        } else {
          svg.pauseAnimations();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="section-gloss relative isolate overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25">
      <SectionBackdrop
        src="/bg/abstract-silver-silk.avif"
        position="background"
      />
      <div className="mx-auto w-full max-w-300">
        <div className="w-full overflow-hidden">
          <div className="border-overlay/10 border-b px-6 py-10 text-center sm:px-8">
            <div className="mx-auto mb-2 flex w-48 justify-center text-brand">
              <svg
                ref={orbitRef}
                aria-hidden="true"
                className="h-12 w-full overflow-visible"
                fill="none"
                viewBox="0 0 192 56"
              >
                <defs>
                  <linearGradient
                    id="ecosystem-light-trail"
                    x1="0"
                    x2="1"
                    y1="0"
                    y2="0"
                  >
                    <stop offset="0" stopColor="currentColor" stopOpacity="0" />
                    <stop
                      offset="0.7"
                      stopColor="currentColor"
                      stopOpacity="0.24"
                    />
                    <stop
                      offset="1"
                      stopColor="currentColor"
                      stopOpacity="0.7"
                    />
                  </linearGradient>
                  <filter
                    id="ecosystem-dot-glow"
                    x="-200%"
                    y="-200%"
                    width="500%"
                    height="500%"
                  >
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <path
                  id="ecosystem-orbit"
                  d="M16 46C40 6 152 6 176 46"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeOpacity="0.3"
                  strokeWidth="1"
                />
                <g filter="url(#ecosystem-dot-glow)">
                  <line
                    x1="-18"
                    x2="-3"
                    y1="0"
                    y2="0"
                    stroke="url(#ecosystem-light-trail)"
                    strokeLinecap="round"
                    strokeWidth="1.4"
                  />
                  <circle r="7" fill="currentColor" opacity="0.08" />
                  <circle r="2.4" fill="currentColor">
                    <animate
                      attributeName="opacity"
                      dur="2s"
                      repeatCount="indefinite"
                      values="0.55;1;0.55"
                    />
                    <animate
                      attributeName="r"
                      dur="2s"
                      repeatCount="indefinite"
                      values="2;2.8;2"
                    />
                  </circle>
                  <animateMotion
                    dur="6s"
                    keyPoints="0;1;0"
                    keyTimes="0;0.5;1"
                    repeatCount="indefinite"
                    rotate="auto"
                  >
                    <mpath href="#ecosystem-orbit" />
                  </animateMotion>
                </g>
              </svg>
            </div>
            <p className="section-kicker">
              {messages.sharedContent.sections.ecosystem.kicker}
            </p>
            <h2 className="section-title font-normal">
              {messages.sharedContent.sections.ecosystem.title}
            </h2>
            <p className="section-lead mx-auto max-w-xl">
              {messages.sharedContent.sections.ecosystem.lead}
            </p>
          </div>

          <PrimitivesPipeline />

          <div className="grid w-full grid-cols-1 sm:grid-cols-3">
            {TRUST_POINTS.map((t) => (
              <div
                key={t.label}
                className="flex min-w-0 items-start gap-4 border-overlay/10 border-b p-6 transition-colors duration-500 last:border-b-0 hover:bg-overlay/[0.018] sm:border-r sm:border-b-0 sm:last:border-r-0"
              >
                <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-overlay/[0.035] text-ink-strong ring-1 ring-overlay/10">
                  <i className={`${t.icon} text-2xl`} />
                </div>
                <div>
                  <p className="font-medium text-ink-strong text-xl">
                    {t.label}
                  </p>
                  <p className="mt-1.5 text-ink-muted text-md leading-relaxed">
                    {t.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
