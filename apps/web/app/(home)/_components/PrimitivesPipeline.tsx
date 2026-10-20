"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { PRIMITIVES } from "../data";

const STAGE_MS = 2600;
const TRAVEL = { duration: 1.1, ease: [0.65, 0, 0.35, 1] as const };

export default function PrimitivesPipeline() {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState(0);
  const count = PRIMITIVES.length;

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setStage((s) => (s + 1) % count), STAGE_MS);
    return () => clearInterval(id);
  }, [reduceMotion, count]);

  const ratio = stage / Math.max(1, count - 1);
  const progress = `${ratio * 100}%`;
  const glowLeft = `${16.67 + ratio * 66.67}%`;

  return (
    <div className="relative overflow-hidden border-overlay/10 border-b px-6 py-12 sm:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden md:block"
      >
        <motion.div
          className="absolute top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/12 blur-3xl"
          animate={{ left: glowLeft }}
          transition={TRAVEL}
        />
      </div>

      <div className="relative grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
        <div
          aria-hidden
          className="absolute top-7 right-[16.67%] left-[16.67%] hidden h-px bg-overlay/15 md:block"
        >
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-brand/40 to-brand"
            animate={{ width: progress }}
            transition={TRAVEL}
          />
        </div>

        {PRIMITIVES.map((p, i) => {
          const active = reduceMotion || stage === i;
          return (
            <div
              key={p.name}
              className="relative flex min-w-0 flex-col gap-4 md:items-center md:text-center"
            >
              <div
                className={`relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-md ring-1 transition-all duration-500 ${
                  active
                    ? "bg-brand/10 text-brand shadow-[0_0_32px_rgb(var(--brand)/0.25)] ring-brand/50"
                    : "bg-surface text-ink-strong ring-overlay/10"
                }`}
              >
                <i className={`${p.icon} text-3xl`} />
                {active && !reduceMotion ? (
                  <motion.span
                    key={stage}
                    aria-hidden
                    className="absolute inset-0 rounded-md ring-2 ring-brand/60"
                    initial={{ opacity: 0.7, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.6 }}
                    transition={{ duration: 1.2, ease: "easeOut", delay: 0.9 }}
                  />
                ) : null}
              </div>
              <div>
                <div className="flex flex-wrap items-baseline gap-2 md:justify-center">
                  <span className="font-medium text-ink-strong text-xl">
                    {p.name}
                  </span>
                  <span
                    className={`font-medium text-md uppercase tracking-widest transition-colors duration-500 ${
                      active ? "text-brand" : "text-ink-muted"
                    }`}
                  >
                    {p.role}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
