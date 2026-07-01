"use client";

import { links } from "@4mica/url";
import { useState } from "react";
import { messages } from "@/i18n";
import { FAQS } from "../data";

export default function FaqSection() {
  const [openQuestions, setOpenQuestions] = useState<Set<string>>(new Set());

  const toggleQuestion = (question: string) => {
    setOpenQuestions((current) => {
      const next = new Set(current);

      if (next.has(question)) {
        next.delete(question);
      } else {
        next.add(question);
      }

      return next;
    });
  };

  return (
    <section id="faq" className="section-gloss py-24">
      <div className="mx-auto w-full max-w-300">
        <div className="mb-6">
          <p className="section-kicker">{messages.home.sections.faqKicker}</p>
          <h2 className="section-title mt-2 font-normal">
            {messages.home.sections.faqTitle}
          </h2>
        </div>

        <div className="w-full">
          {FAQS.map((faq, index) => {
            const isOpen = openQuestions.has(faq.question);
            const isLast = index === FAQS.length - 1;

            return (
              <div
                key={faq.question}
                className={isLast ? "" : "border-white/10 border-b"}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleQuestion(faq.question)}
                  className="w-full cursor-pointer select-none px-0 pt-6 pb-4 text-left transition-colors focus:outline-none"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-semibold text-ink-strong text-md">
                      {faq.question}
                    </span>
                    <i
                      className={`ri-arrow-down-s-line ml-4 shrink-0 text-ink-subtle text-xl transition-transform duration-200 ${
                        isOpen ? "-rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>

                <div
                  className={`overflow-hidden transition-all duration-200 ease-in-out ${
                    isOpen ? "max-h-125 pb-6 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <p className="text-ink-muted text-md leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Contact Support */}
        <div className="mt-14 flex items-center justify-start gap-1.5 text-md">
          <span className="font-normal text-ink-muted">
            {messages.home.sections.faqSupportPrompt}
          </span>
          <a
            href={links.mailto.contact}
            className="text-ink-muted underline underline-offset-4 transition-colors hover:text-ink-strong"
          >
            {messages.home.sections.contactUs}
          </a>
        </div>
      </div>
    </section>
  );
}
