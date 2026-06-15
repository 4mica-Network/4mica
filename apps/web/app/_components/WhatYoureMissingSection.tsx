"use client";

import { motion } from "framer-motion";
import {
  micaLines,
  micaNet,
  netDelta,
  SCENARIO,
  x402Lines,
  x402Total,
} from "../data";

const RED = "#f87171";
const GREEN = "#4ade80";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

export default function WhatYoureMissingSection() {
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
          <p className="section-kicker">The real cost</p>
          <h2 className="section-title">Agentic economy breaks at scale.</h2>
          <p className="section-lead mx-auto max-w-xl">
            1M API calls, 10k USDC volume, 1 year.
          </p>
        </motion.div>

        <div className="grid w-full grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
          {/* x402 */}
          <motion.div
            className="flex flex-col overflow-hidden rounded-md"
            style={{ border: `1px solid ${RED}38` }}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            transition={{ duration: 0.38, ease: "easeOut" }}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ background: `${RED}12` }}
            >
              <div>
                <p
                  className="font-semibold text-md uppercase tracking-widest"
                  style={{ color: RED }}
                >
                  x402
                </p>
                <p className="mt-0.5 text-ink-subtle text-md">
                  per-transaction settlement
                </p>
              </div>
              <i
                className="ri-close-circle-line text-xl"
                style={{ color: RED }}
              />
            </div>
            <div className="flex flex-1 flex-col px-6 py-5">
              <div className="flex-1 space-y-5">
                {x402Lines.map((line, index) => (
                  <motion.div
                    key={line.label}
                    className="flex items-start justify-between gap-4"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{
                      duration: 0.28,
                      delay: index * 0.05,
                      ease: "easeOut",
                    }}
                  >
                    <div>
                      <p className="font-medium text-ink-body text-md">
                        {line.label}
                      </p>
                      <p className="mt-0.5 text-ink-subtle text-md">
                        {line.note}
                      </p>
                    </div>
                    <span
                      className="shrink-0 font-bold text-md tabular-nums"
                      style={{ color: RED }}
                    >
                      {line.value}
                    </span>
                  </motion.div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between border-white/10 border-t pt-4">
                <span className="font-semibold text-ink-strong text-md">
                  Total cost
                </span>
                <span className="font-bold text-lg" style={{ color: RED }}>
                  ${x402Total.toLocaleString()} USDC
                </span>
              </div>
            </div>
          </motion.div>

          {/* 4Mica */}
          <motion.div
            className="flex flex-col overflow-hidden rounded-md"
            style={{ border: `1px solid ${GREEN}38` }}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            transition={{ duration: 0.38, delay: 0.08, ease: "easeOut" }}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ background: `${GREEN}12` }}
            >
              <div>
                <p
                  className="font-semibold text-md uppercase tracking-widest"
                  style={{ color: GREEN }}
                >
                  With 4Mica
                </p>
                <p className="mt-0.5 text-ink-subtle text-md">
                  credit layer + batch settlement
                </p>
              </div>
              <i
                className="ri-checkbox-circle-line text-xl"
                style={{ color: GREEN }}
              />
            </div>
            <div className="flex flex-1 flex-col px-6 py-5">
              <div className="flex-1 space-y-5">
                {micaLines.map((line, index) => (
                  <motion.div
                    key={line.label}
                    className="flex items-start justify-between gap-4"
                    initial={{ opacity: 0, x: 10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{
                      duration: 0.28,
                      delay: index * 0.05 + 0.08,
                      ease: "easeOut",
                    }}
                  >
                    <div>
                      <p className="font-medium text-ink-body text-md">
                        {line.label}
                      </p>
                      <p className="mt-0.5 text-ink-subtle text-md">
                        {line.note}
                      </p>
                    </div>
                    <span
                      className="shrink-0 font-bold text-md tabular-nums"
                      style={{ color: GREEN }}
                    >
                      {line.value}
                    </span>
                  </motion.div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between border-white/10 border-t pt-4">
                <span className="font-semibold text-ink-strong text-md">
                  Net cost
                </span>
                <span className="font-bold text-lg" style={{ color: GREEN }}>
                  ${micaNet.toLocaleString()} USDC
                </span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Delta */}
        <motion.div
          className="glass-panel mt-6 flex w-full flex-col items-center justify-between gap-4 rounded-md px-6 py-5 sm:flex-row sm:px-8"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          transition={{ duration: 0.36, delay: 0.14, ease: "easeOut" }}
        >
          <p className="text-ink-muted text-md">
            Same 1M calls. Same starting capital.
          </p>
          <p className="text-center font-bold text-ink-strong text-lg sm:text-right">
            <span style={{ color: GREEN }}>
              ${netDelta.toLocaleString()} saved
            </span>
            <span className="mx-2 text-ink-subtle">·</span>
            <span style={{ color: GREEN }}>
              {SCENARIO.x402LatencyHours - SCENARIO.micaLatencyHours} hours
              reclaimed
            </span>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
