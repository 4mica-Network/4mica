"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { messages } from "@/i18n";

const content = messages.home.agenticPayments;
const BRAND_ACTOR = 2;

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

type Step = (typeof content.flows)[number]["steps"][number];

const stepNum = (index: number) => String(index + 1).padStart(2, "0");

function Arrow({
  step,
  index,
  state,
}: {
  step: Step;
  index: number;
  state: "shown" | "current" | "next" | "hidden";
}) {
  const isBrand = "brand" in step;
  const opacity = { shown: 1, current: 1, next: 0.15, hidden: 0 }[state];
  const labelClass = isBrand
    ? "text-brand"
    : state === "current"
      ? "text-ink-strong"
      : "text-ink-body";
  const label = (
    <>
      <span className="mr-2 text-ink-subtle tabular-nums">
        {stepNum(index)}
      </span>
      {step.label}
    </>
  );

  if ("note" in step) {
    return (
      <motion.div
        className={`relative z-10 col-span-full mx-auto rounded-md border border-dashed bg-surface px-3 py-1 text-center text-xs sm:text-sm ${
          isBrand ? "border-brand/50" : "border-overlay/15"
        } ${labelClass}`}
        initial={false}
        animate={{ opacity, y: state === "hidden" ? 6 : 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {label}
      </motion.div>
    );
  }

  const start = Math.min(step.from, step.to);
  const span = Math.abs(step.to - step.from) + 1;
  const inset = `${50 / span}%`;
  const rightward = step.to > step.from;
  const drawn = state !== "hidden";

  return (
    <motion.div
      className="relative z-10"
      style={{
        gridColumn: `${start + 1} / span ${span}`,
        paddingLeft: inset,
        paddingRight: inset,
      }}
      initial={false}
      animate={{ opacity }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <p className={`text-center text-xs sm:text-sm ${labelClass}`}>{label}</p>
      <div
        className={`mt-1.5 flex items-center ${isBrand ? "text-brand" : "text-ink-muted"} ${rightward ? "" : "flex-row-reverse"}`}
      >
        <motion.div
          className="h-px flex-1 bg-current"
          style={{ originX: rightward ? 0 : 1 }}
          initial={false}
          animate={{ scaleX: drawn ? 1 : 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        />
        <i
          className={`${rightward ? "ri-arrow-right-s-fill -ml-1.5" : "ri-arrow-left-s-fill -mr-1.5"} text-base leading-none`}
        />
      </div>
    </motion.div>
  );
}

export default function AgenticPaymentsSection() {
  const [flowId, setFlowId] = useState<string>(content.flows[0].id);
  const [revealed, setRevealed] = useState(1);
  const flow =
    content.flows.find((item) => item.id === flowId) ?? content.flows[0];
  const total = flow.steps.length;
  const current = revealed - 1;
  const isComplete = revealed === total;

  const selectFlow = (id: string) => {
    setFlowId(id);
    setRevealed(1);
  };

  const advance = () => setRevealed(isComplete ? 1 : revealed + 1);

  const stateOf = (index: number) =>
    index === current
      ? "current"
      : index < current
        ? "shown"
        : index === revealed
          ? "next"
          : "hidden";

  return (
    <section className="section-gloss mt-24 py-20 md:mt-40">
      <div className="mx-auto w-full max-w-300">
        <motion.div
          className="mb-10 text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          transition={{ duration: 0.36, ease: "easeOut" }}
        >
          <p className="section-kicker">{content.kicker}</p>
          <h2 className="section-title mx-auto max-w-3xl text-balance font-normal">
            {content.title}
          </h2>
        </motion.div>

        <div className="overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25">
          <div className="flex flex-wrap justify-center gap-2 border-overlay/10 border-b p-3">
            {content.flows.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === flow.id}
                onClick={() => selectFlow(item.id)}
                className={`rounded-md px-3 py-1.5 font-medium text-md transition-colors duration-300 ${
                  item.id === flow.id
                    ? "bg-overlay/10 text-ink-strong ring-1 ring-overlay/15"
                    : "text-ink-muted hover:text-ink-body"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={advance}
            aria-label={isComplete ? content.replay : content.next}
            className="relative block w-full cursor-pointer px-2 pt-5 pb-3 text-left sm:px-6"
          >
            <div className="pointer-events-none absolute inset-x-2 inset-y-0 grid grid-cols-4 sm:inset-x-6">
              {content.actors.map((actor) => (
                <div
                  key={actor}
                  className="mx-auto w-0 border-overlay/20 border-l border-dashed"
                />
              ))}
            </div>

            <div className="relative z-10 grid grid-cols-4">
              {content.actors.map((actor, i) => (
                <span
                  key={actor}
                  className={`mx-auto rounded-md border bg-surface px-2 py-0.5 text-center font-medium text-xs uppercase tracking-widest sm:text-sm ${
                    i === BRAND_ACTOR
                      ? "border-brand/50 text-brand"
                      : "border-overlay/10 text-ink-strong"
                  }`}
                >
                  {actor}
                </span>
              ))}
            </div>

            <div key={flow.id} className="mt-5 grid grid-cols-4 gap-y-3">
              {flow.steps.map((step, index) => (
                <Arrow
                  key={step.label}
                  step={step}
                  index={index}
                  state={stateOf(index)}
                />
              ))}
            </div>

            <p className="relative z-10 mt-5 flex justify-end gap-2 font-mono text-ink-muted text-xs uppercase tracking-widest">
              <span>{isComplete ? content.replay : content.next}</span>
              <span className="tabular-nums">
                {stepNum(current)} / {stepNum(total - 1)}
              </span>
            </p>
          </button>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          <div className="min-h-28">
            <AnimatePresence mode="wait">
              <motion.p
                key={`${flow.id}-${current}`}
                className="flex items-baseline gap-3 text-2xl text-ink-strong leading-snug md:text-3xl"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <span className="font-mono text-brand text-md">
                  {stepNum(current)}
                </span>
                {flow.steps[current].desc}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="grid grid-cols-3 gap-5">
            {content.stats.map((s) => (
              <div key={s.label} className="border-overlay/20 border-t pt-4">
                <p className="text-4xl text-brand">{s.value}</p>
                <p className="mt-2 font-mono text-ink-muted text-sm uppercase tracking-wider">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
