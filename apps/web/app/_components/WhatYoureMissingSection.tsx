"use client";

import { useTheme } from "@context/ThemeProvider";
import { motion } from "framer-motion";
import type { CSSProperties, PointerEvent } from "react";
import { useRef, useState } from "react";
import { messages } from "@/i18n";
import {
  micaLines,
  micaNet,
  netDelta,
  SCENARIO,
  x402Lines,
  x402Total,
} from "../data";

// Bright shades read well on the dark theme; deeper 600-level shades keep
// enough contrast on light surfaces.
const ACCENTS = {
  dark: { red: "#f87171", green: "#4ade80" },
  light: { red: "#dc2626", green: "#16a34a" },
};
const NEUTRAL_BORDER = "rgb(var(--overlay) / 0.1)";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

type CostLine = {
  label: string;
  value: string;
  note: string;
};

type ComparisonCardProps = {
  accent: string;
  direction: "left" | "right";
  delay?: number;
  eyebrow: string;
  subtitle: string;
  icon: string;
  lines: CostLine[];
  totalLabel: string;
  totalValue: string;
};

function ComparisonCard({
  accent,
  direction,
  delay = 0,
  eyebrow,
  subtitle,
  icon,
  lines,
  totalLabel,
  totalValue,
}: ComparisonCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [pointerPosition, setPointerPosition] = useState({ x: 0, y: 0 });

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!cardRef.current || event.pointerType === "touch") return;

    const rect = cardRef.current.getBoundingClientRect();
    setPointerPosition({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  const handlePointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    setIsHovered(true);
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
  };

  return (
    <motion.div
      ref={cardRef}
      className="group relative flex flex-col overflow-hidden rounded-md bg-surface-deep/25 transition-colors duration-500"
      style={{ "--card-accent": accent } as CSSProperties}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={fadeUp}
      transition={{ duration: 0.38, delay, ease: "easeOut" }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-md transition-all duration-500 ease-out"
        style={{
          padding: "1px",
          background: isHovered
            ? `radial-gradient(circle 430px at ${pointerPosition.x}px ${pointerPosition.y}px, ${accent}99, ${accent}33 34%, ${NEUTRAL_BORDER} 68%)`
            : NEUTRAL_BORDER,
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100"
        style={{
          background: `radial-gradient(circle 520px at 50% 0%, ${accent}18, transparent 58%)`,
        }}
      />

      <div className="relative z-10 flex items-center justify-between px-6 py-4 transition-colors duration-500 group-hover:bg-overlay/2.5">
        <div>
          <p className="font-semibold text-ink-strong text-md uppercase tracking-widest transition-colors duration-500 group-hover:text-(--card-accent)">
            {eyebrow}
          </p>
          <p className="mt-0.5 text-ink-subtle text-md transition-colors duration-500 group-hover:text-ink-body">
            {subtitle}
          </p>
        </div>
        <i
          className={`${icon} text-ink-strong/80 text-xl transition-colors duration-500 group-hover:text-(--card-accent)`}
        />
      </div>

      <div className="relative z-10 flex flex-1 flex-col px-6 py-5">
        <div className="flex-1 space-y-5">
          {lines.map((line, index) => (
            <motion.div
              key={line.label}
              className="flex items-start justify-between gap-4"
              initial={{ opacity: 0, x: direction === "left" ? -10 : 10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{
                duration: 0.28,
                delay: index * 0.05 + delay,
                ease: "easeOut",
              }}
            >
              <div>
                <p className="font-medium text-ink-body text-md transition-colors duration-500 group-hover:text-ink-strong">
                  {line.label}
                </p>
                <p className="mt-0.5 text-ink-subtle text-md transition-colors duration-500 group-hover:text-ink-muted">
                  {line.note}
                </p>
              </div>
              <span className="shrink-0 font-bold text-ink-strong text-md tabular-nums transition-colors duration-500 group-hover:text-(--card-accent)">
                {line.value}
              </span>
            </motion.div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between border-overlay/10 border-t pt-4 transition-colors duration-500 group-hover:border-overlay/15">
          <span className="font-semibold text-ink-strong text-md">
            {totalLabel}
          </span>
          <span className="font-bold text-ink-strong text-lg transition-colors duration-500 group-hover:text-(--card-accent)">
            {totalValue}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export default function WhatYoureMissingSection() {
  const { theme } = useTheme();
  const { red: RED, green: GREEN } = ACCENTS[theme];

  return (
    <section className="section-gloss py-20">
      <div className="mx-auto w-full max-w-300">
        <motion.div
          className="mb-10 text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          transition={{ duration: 0.36, ease: "easeOut" }}
        >
          <p className="section-kicker">
            {messages.home.sections.realCostKicker}
          </p>
          <h2 className="section-title font-normal">
            {messages.home.sections.realCostTitle}
          </h2>
          <p className="section-lead mx-auto max-w-xl">
            {messages.home.sections.realCostLead}
          </p>
        </motion.div>

        <div className="grid w-full grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
          <ComparisonCard
            accent={RED}
            direction="left"
            eyebrow={messages.home.sections.x402Eyebrow}
            icon="ri-close-circle-line"
            lines={x402Lines}
            subtitle={messages.home.sections.x402Subtitle}
            totalLabel={messages.home.sections.totalCost}
            totalValue={`$${x402Total.toLocaleString()} USDC`}
          />

          <ComparisonCard
            accent={GREEN}
            delay={0.08}
            direction="right"
            eyebrow={messages.home.sections.micaEyebrow}
            icon="ri-checkbox-circle-line"
            lines={micaLines}
            subtitle={messages.home.sections.micaSubtitle}
            totalLabel={messages.home.sections.netCost}
            totalValue={`$${micaNet.toLocaleString()} USDC`}
          />
        </div>

        {/* Delta */}
        <motion.div
          className="mt-10 flex w-full flex-col items-start justify-start gap-5 px-2 text-left sm:flex-row"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          transition={{ duration: 0.36, delay: 0.14, ease: "easeOut" }}
        >
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center"
            style={{ color: GREEN }}
          >
            <i className="ri-arrow-up-double-line text-6xl" />
          </div>

          <div>
            <p className="mb-2 text-ink-muted text-md">
              {messages.home.sections.deltaLead}
            </p>
            <p className="flex flex-col gap-1 font-medium text-3xl text-ink-strong leading-tight sm:flex-row sm:items-baseline sm:gap-3 md:text-3xl">
              <span>
                ${netDelta.toLocaleString()} {messages.home.sections.saved}
              </span>
              <span className="hidden text-2xl text-ink-subtle/60 sm:inline">
                /
              </span>
              <span>
                {SCENARIO.x402LatencyHours - SCENARIO.micaLatencyHours} hours{" "}
                {messages.home.sections.reclaimed}
              </span>
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
