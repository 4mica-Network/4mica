"use client";

import Link from "next/link";
import { messages } from "@/i18n";
import { aboutCards } from "./data";

export default function AboutSection() {
  return (
    <section id="about" className="section-gloss py-24">
      <div className="w-full">
        <div className="mx-auto max-w-3xl text-center">
          <p className="section-kicker">
            {messages.sharedContent.sections.about.kicker}
          </p>
          <h2 className="section-title">
            {messages.sharedContent.sections.about.title}
          </h2>
          <p className="section-lead">
            {messages.sharedContent.sections.about.lead}
          </p>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {aboutCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="glass-panel rounded-md p-6 transition-all duration-300 hover:-translate-y-0.5"
            >
              <h3 className="font-semibold text-ink-strong text-xl">
                {card.title}
              </h3>
              <p className="mt-3 text-ink-body text-md leading-relaxed">
                {card.description}
              </p>
              <span className="link-accent mt-4 inline-flex items-center font-semibold text-md">
                {messages.sharedContent.sections.about.learnMore}
                <i className="ri-arrow-right-line ml-2 text-md"></i>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
