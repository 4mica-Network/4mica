"use client";

import { links } from "@4mica/url";
import Link from "next/link";
import { STATS } from "../data";

export default function FinalCtaSection() {
  return (
    <section className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <div className="mx-auto max-w-3xl text-center">
          <p className="section-kicker">Start building</p>
          <h2 className="section-title mt-4 mb-2 text-balance font-normal text-ink-strong">
            Stop paying per transaction.
          </h2>{" "}
          <span className="font-normal text-ink-muted">
            Batch thousands of payments, settle once, and let your collateral
            earn yield while your agents scale.
          </span>
          {/* Stats */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
            {STATS.map((s, i) => (
              <div key={s.label} className="contents">
                <div className="flex flex-col items-center gap-1">
                  <span className="font-bold text-3xl text-ink-strong tabular-nums">
                    {s.value}
                  </span>
                  <span className="text-ink-muted text-md">{s.label}</span>
                </div>
                {i < STATS.length - 1 && (
                  <div className="hidden h-8 w-px bg-white/10 sm:block" />
                )}
              </div>
            ))}
          </div>
          {/* Divider between stats */}
          <div className="mt-10 flex flex-col justify-center gap-3 border-white/10 border-t pt-10 sm:flex-row">
            <Link
              href="/pricing"
              className="btn btn-lg rounded-full bg-white text-center font-semibold text-black shadow-lg transition-colors hover:bg-white/90"
            >
              Start Building
            </Link>
            <Link
              href={links.social.githubCore}
              target="_blank"
              rel="noreferrer"
              className="btn btn-soft btn-lg rounded-full text-center"
            >
              <i className="ri-github-fill" />
              View Source
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
