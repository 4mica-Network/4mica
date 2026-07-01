"use client";

import Link from "next/link";
import { messages } from "@/i18n";
import { githubUrl, hooks } from "./data";

export default function CommunitySection() {
  return (
    <section id="community" className="section-gloss py-20">
      <div className="w-full">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="section-kicker">
              {messages.sharedContent.sections.community.kicker}
            </p>
            <h2 className="section-title">
              {messages.sharedContent.sections.community.title}
            </h2>
            <p className="section-lead">
              {messages.sharedContent.sections.community.lead}
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href={githubUrl}
                className="btn btn-primary btn-md text-center"
              >
                {messages.sharedContent.sections.community.joinCommunity}
              </Link>
              <Link href="/pricing" className="btn btn-soft btn-md text-center">
                {messages.common.actions.startBuilding}
              </Link>
            </div>
          </div>
          <div className="grid gap-4">
            {hooks.map((hook) => (
              <Link
                key={hook.label}
                href={hook.href}
                className="glass-panel rounded-md px-5 py-4 font-semibold text-ink-strong text-md transition-colors hover:text-ink"
              >
                {hook.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
