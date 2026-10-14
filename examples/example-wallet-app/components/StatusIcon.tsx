"use client";

import { Spinner } from "@4mica/ui";
import { AnimatePresence, motion } from "framer-motion";

export type Status = "loading" | "success" | "error";

const pop = {
  initial: { scale: 0.4, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.4, opacity: 0 },
  transition: { type: "spring", stiffness: 380, damping: 20 },
} as const;

export function StatusIcon({
  status,
  size = 56,
}: {
  status: Status;
  size?: number;
}) {
  return (
    <div
      style={{ width: size, height: size }}
      className="relative grid place-items-center"
    >
      <AnimatePresence mode="wait" initial={false}>
        {status === "loading" && (
          <motion.div key="loading" {...pop}>
            <Spinner size="xl" className="text-ink-muted" />
          </motion.div>
        )}

        {status === "success" && (
          <motion.svg
            key="success"
            {...pop}
            viewBox="0 0 52 52"
            width={size}
            height={size}
            aria-label="Success"
            role="img"
          >
            <motion.circle
              cx="26"
              cy="26"
              r="24"
              fill="rgb(16 185 129 / 0.15)"
              stroke="rgb(16 185 129)"
              strokeWidth="2.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
            <motion.path
              d="M15 27 L23 34 L38 18"
              fill="none"
              stroke="rgb(16 185 129)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.3, duration: 0.35, ease: "easeOut" }}
            />
          </motion.svg>
        )}

        {status === "error" && (
          <motion.svg
            key="error"
            {...pop}
            viewBox="0 0 52 52"
            width={size}
            height={size}
            aria-label="Failed"
            role="img"
          >
            <circle
              cx="26"
              cy="26"
              r="24"
              fill="rgb(239 68 68 / 0.15)"
              stroke="rgb(239 68 68)"
              strokeWidth="2.5"
            />
            <motion.path
              d="M18 18 L34 34 M34 18 L18 34"
              fill="none"
              stroke="rgb(239 68 68)"
              strokeWidth="4"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35 }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </div>
  );
}
