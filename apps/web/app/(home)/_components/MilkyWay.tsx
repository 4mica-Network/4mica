"use client";

import { motion, useReducedMotion } from "framer-motion";

const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const round = (n: number) => Math.round(n * 1000) / 1000;

const STARS = Array.from({ length: 96 }, (_, i) => {
  const angle = rand(i) * Math.PI * 2;
  const radius = Math.sqrt(rand(i + 7));
  return {
    left: round(50 + Math.cos(angle) * radius * 55),
    top: round(50 + Math.sin(angle) * radius * 24),
    size: round(0.6 + rand(i + 13) * 1.8),
    opacity: round(0.3 + rand(i + 21) * 0.7),
    delay: rand(i + 29) * 4,
    duration: 2.6 + rand(i + 37) * 3,
  };
});

const CONTAINER_MASK = "radial-gradient(circle, #000 48%, transparent 94%)";

export default function MilkyWay() {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden
      className="relative size-64 shrink-0 xl:size-112"
      style={{ WebkitMaskImage: CONTAINER_MASK, maskImage: CONTAINER_MASK }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--surface-deep)) 30%, transparent 72%)",
        }}
      />

      <motion.div
        className="absolute inset-0"
        {...(reduceMotion
          ? {}
          : {
              animate: { scale: [1, 1.05, 1], rotate: [-1, 1, -1] },
              transition: {
                duration: 18,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut" as const,
              },
            })}
      >
        <div
          className="absolute inset-0"
          style={{ transform: "rotate(-22deg)" }}
        >
          <div
            className="absolute top-1/2 left-1/2 h-[38%] w-[140%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-2xl"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(255,255,255,0.14), rgb(var(--brand) / 0.14) 35%, rgb(var(--brand-violet) / 0.1) 62%, transparent 78%)",
            }}
          />
          <div
            className="absolute top-[46%] left-[36%] h-[26%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-2xl"
            style={{
              background:
                "radial-gradient(ellipse at center, rgb(var(--brand-teal) / 0.18), transparent 70%)",
            }}
          />
          <div
            className="absolute top-[56%] left-[64%] h-[24%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-2xl"
            style={{
              background:
                "radial-gradient(ellipse at center, rgb(var(--brand-violet) / 0.2), transparent 70%)",
            }}
          />

          <div
            className="absolute top-1/2 left-1/2 h-8 w-28 -translate-x-1/2 -translate-y-1/2 rounded-[50%] blur-lg"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(255,255,255,0.6), rgba(255,238,214,0.25) 50%, transparent 80%)",
            }}
          />

          {STARS.map((s, i) => (
            <motion.span
              key={`${s.left.toFixed(2)}-${s.top.toFixed(2)}-${i}`}
              className="absolute rounded-full bg-white"
              style={{
                left: `${s.left}%`,
                top: `${s.top}%`,
                width: `${s.size}px`,
                height: `${s.size}px`,
                opacity: s.opacity,
              }}
              {...(reduceMotion
                ? {}
                : {
                    animate: {
                      opacity: [s.opacity * 0.35, s.opacity, s.opacity * 0.35],
                      scale: [1, 1.35, 1],
                    },
                    transition: {
                      duration: s.duration,
                      delay: s.delay,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeInOut" as const,
                    },
                  })}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
