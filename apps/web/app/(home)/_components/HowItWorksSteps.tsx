"use client";

import {
  type MotionValue,
  motion,
  useScroll,
  useTransform,
} from "framer-motion";
import { useRef, useState } from "react";
import { messages } from "@/i18n";
import { STEPS } from "../data";

const LAYERS = messages.home.layers;
const BRAND_LAYER = 1;
const LAYER_GAP_REM = 5.5;
const LAYER_HALF_REM = 7;

function Layer({
  index,
  isActive,
  progress,
}: {
  index: number;
  isActive: boolean;
  progress: MotionValue<number>;
}) {
  const layer = LAYERS[index];
  const isBrand = index === BRAND_LAYER;
  const offset = useTransform(progress, (p) => index * LAYER_GAP_REM * p);
  const top = useTransform(offset, (o) => `${o}rem`);
  const labelTop = useTransform(offset, (o) => `${LAYER_HALF_REM + o}rem`);

  return (
    <>
      <motion.div
        className="absolute left-14 size-56"
        style={{ top, zIndex: LAYERS.length - index }}
      >
        <div
          className={`size-full rounded-[2.5rem] border backdrop-blur-sm transition-all duration-500 ${
            isBrand
              ? isActive
                ? "border-brand bg-brand/25 shadow-[0_0_80px_rgb(var(--brand)/0.4)]"
                : "border-brand/70 bg-brand/15 shadow-[0_0_60px_rgb(var(--brand)/0.25)]"
              : isActive
                ? "border-overlay/60 bg-overlay/10 shadow-[0_0_60px_rgb(var(--overlay)/0.12)]"
                : "border-overlay/20 bg-overlay/[0.04]"
          }`}
          style={{
            transform: `translateY(${isActive ? -0.75 : 0}rem) rotateX(55deg) rotateZ(-45deg)`,
          }}
        />
      </motion.div>
      <motion.div
        className="absolute left-82 flex -translate-y-1/2 items-start gap-3 whitespace-nowrap font-mono uppercase tracking-widest"
        style={{ top: labelTop, opacity: progress }}
      >
        <div
          className={`mt-2.5 h-px w-8 transition-colors duration-500 ${
            isBrand ? "bg-brand" : isActive ? "bg-ink-strong" : "bg-overlay/25"
          }`}
        />
        <div>
          <p
            className={`text-md transition-colors duration-500 ${
              isBrand
                ? "text-brand"
                : isActive
                  ? "text-ink-strong"
                  : "text-ink-muted"
            }`}
          >
            {layer.name}
          </p>
          <p className="mt-1 text-ink-subtle text-md">{layer.role}</p>
        </div>
      </motion.div>
    </>
  );
}

export default function HowItWorksSteps() {
  const [active, setActive] = useState<number | null>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: introRef,
    offset: ["start 0.25", "end 0.5"],
  });
  const step = active === null ? null : STEPS[active];

  return (
    <div className="grid gap-16 xl:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-16 xl:gap-0">
        <motion.div
          ref={introRef}
          className="hidden xl:block xl:h-[50vh]"
          onViewportEnter={() => setActive(null)}
          viewport={{ margin: "-50% 0px -50% 0px" }}
        />
        {STEPS.map((item, i) => (
          <motion.div
            key={item.num}
            className={`transition-opacity duration-500 xl:flex xl:min-h-[70vh] xl:flex-col xl:justify-center ${
              i === active ? "" : "xl:opacity-40"
            }`}
            onViewportEnter={() => setActive(i)}
            viewport={{ margin: "-50% 0px -50% 0px" }}
          >
            <p className="font-mono text-ink-muted text-sm uppercase tracking-widest md:text-md">
              <span className="text-brand">{item.num}</span> · {item.badge}
            </p>
            <h3 className="mt-3 font-normal text-2xl text-ink-strong tracking-tight md:mt-4 md:text-4xl">
              {item.title}
            </h3>
            <p className="mt-3 max-w-xl text-base text-ink-muted leading-relaxed xl:hidden">
              {item.caption}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="hidden xl:block">
        <div className="sticky top-[max(6rem,calc(50vh-17.5rem))]">
          <div className="relative h-120 w-120">
            {LAYERS.map((layer, i) => (
              <Layer
                key={layer.name}
                index={i}
                isActive={i === step?.layer}
                progress={scrollYProgress}
              />
            ))}
          </div>
          <p className="mt-6 flex min-h-16 items-baseline gap-3 text-2xl text-ink-strong">
            {step && (
              <>
                <span className="font-mono text-brand text-md">{step.num}</span>
                {step.caption}
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
