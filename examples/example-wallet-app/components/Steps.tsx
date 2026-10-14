"use client";

import { cn } from "@4mica/ui";
import { motion } from "framer-motion";

export function Steps({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <motion.span
              animate={{ scale: active ? 1.1 : 1 }}
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full font-semibold text-xs transition-colors",
                done && "bg-success text-surface-deep",
                active && "bg-ink-strong text-surface-deep",
                !done && !active && "bg-overlay/10 text-ink-subtle",
              )}
            >
              {done ? "✓" : index + 1}
            </motion.span>
            <span
              className={cn(
                "text-xs transition-colors",
                active || done ? "text-ink-strong" : "text-ink-subtle",
              )}
            >
              {label}
            </span>
            {index < steps.length - 1 && (
              <span className="relative h-px flex-1 overflow-hidden bg-overlay/10">
                <motion.span
                  className="absolute inset-y-0 left-0 bg-success"
                  initial={false}
                  animate={{ width: done ? "100%" : "0%" }}
                  transition={{ duration: 0.4 }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
