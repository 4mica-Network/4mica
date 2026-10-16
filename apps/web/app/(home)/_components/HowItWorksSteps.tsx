"use client";

import {
  type AnimationPlaybackControls,
  animate,
  type MotionValue,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { messages } from "@/i18n";
import { STEPS } from "../data";

const LAYERS = messages.home.layers;
const BRAND_LAYER = 1;
const LAYER_GAP_REM = 5.5;
const LAYER_HALF_REM = 7;
const GLIDE = { duration: 0.9, ease: [0.22, 1, 0.36, 1] } as const;
const SEPARATE = { duration: 1.6, ease: [0.65, 0, 0.35, 1] } as const;

const centerOffset = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  return rect.top + rect.height / 2 - window.innerHeight / 2;
};

function Layer({
  index,
  isActive,
  progress,
  onSelect,
}: {
  index: number;
  isActive: boolean;
  progress: MotionValue<number>;
  onSelect: () => void;
}) {
  const layer = LAYERS[index];
  const isBrand = index === BRAND_LAYER;
  const offset = useTransform(progress, (p) => index * LAYER_GAP_REM * p);
  const top = useTransform(offset, (o) => `${o}rem`);
  const labelTop = useTransform(offset, (o) => `${LAYER_HALF_REM + o}rem`);
  const labelOpacity = useTransform(progress, [0.6, 1], [0, 1]);

  return (
    <>
      <motion.div
        className="absolute left-4 size-56"
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
      <motion.button
        type="button"
        onClick={onSelect}
        className="group absolute left-[18.5rem] flex -translate-y-1/2 cursor-pointer items-start gap-3 whitespace-nowrap rounded-sm text-left font-mono uppercase tracking-widest focus-visible:outline-2 focus-visible:outline-brand/60 focus-visible:outline-offset-4"
        style={{ top: labelTop, opacity: labelOpacity }}
      >
        <div
          className={`mt-2.5 h-px w-8 transition-colors duration-500 ${
            isBrand ? "bg-brand" : isActive ? "bg-ink-strong" : "bg-overlay/25"
          }`}
        />
        <div>
          <p
            className={`text-sm transition-colors duration-500 ${
              isBrand
                ? "text-brand"
                : isActive
                  ? "text-ink-strong"
                  : "text-ink-muted group-hover:text-ink-strong"
            }`}
          >
            {layer.name}
          </p>
          <p className="mt-1 text-ink-subtle text-sm transition-colors duration-300 group-hover:text-ink-muted">
            {layer.role}
          </p>
        </div>
      </motion.button>
    </>
  );
}

export default function HowItWorksSteps() {
  const [active, setActive] = useState<number | null>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const stackInView = useInView(stackRef, { amount: 0.6 });
  const separation = useMotionValue(0);
  const step = active === null ? null : STEPS[active];
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const glideRef = useRef<AnimationPlaybackControls | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const controls = animate(
      separation,
      stackInView ? 1 : 0,
      reduceMotion ? { duration: 0 } : SEPARATE,
    );
    return () => controls.stop();
  }, [stackInView, reduceMotion, separation]);

  const glideTo = useCallback(
    (el: HTMLElement) => {
      glideRef.current?.stop();
      const target = window.scrollY + centerOffset(el);
      if (reduceMotion) {
        window.scrollTo(0, target);
        return;
      }
      glideRef.current = animate(window.scrollY, target, {
        ...GLIDE,
        onUpdate: (y) => window.scrollTo(0, y),
        onComplete: () => {
          glideRef.current = null;
        },
      });
    },
    [reduceMotion],
  );

  const selectLayer = (layer: number) => {
    const el = stepRefs.current[STEPS.findIndex((s) => s.layer === layer)];
    if (el) glideTo(el);
  };

  return (
    <div className="grid gap-16 xl:grid-cols-[1fr_1.25fr]">
      <div className="flex min-w-0 flex-col gap-16 xl:gap-0">
        <motion.div
          className="hidden xl:block xl:h-[50vh]"
          onViewportEnter={() => setActive(null)}
          viewport={{ margin: "-50% 0px -50% 0px" }}
        />
        {STEPS.map((item, i) => (
          <motion.div
            key={item.num}
            ref={(el) => {
              stepRefs.current[i] = el;
            }}
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
            <p className="mt-3 max-w-md text-base text-ink-muted leading-relaxed md:mt-4 md:text-lg">
              {item.caption}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="hidden xl:block">
        <div className="sticky top-[max(6rem,calc(50vh-15rem))]">
          <div ref={stackRef} className="relative h-120 w-full">
            {LAYERS.map((layer, i) => (
              <Layer
                key={layer.name}
                index={i}
                isActive={i === step?.layer}
                progress={separation}
                onSelect={() => selectLayer(i)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
