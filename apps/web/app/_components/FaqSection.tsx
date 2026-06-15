"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
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
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="mb-12 text-center">
          <p className="section-kicker">FAQ</p>
          <h2 className="section-title">Common questions</h2>
        </div>

        <div className="w-full space-y-3 overflow-hidden">
          {FAQS.map((faq) => {
            const isOpen = openQuestions.has(faq.question);

            return (
              <div
                key={faq.question}
                className="glass-panel overflow-hidden rounded-xl"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleQuestion(faq.question)}
                  className="flex w-full cursor-pointer select-none items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-ink-strong text-sm"
                >
                  <span>{faq.question}</span>
                  <motion.i
                    className="ri-arrow-down-s-line shrink-0 text-ink-subtle text-xl"
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.24, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-4">
                        <p className="text-ink-muted text-sm leading-relaxed">
                          {faq.answer}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
