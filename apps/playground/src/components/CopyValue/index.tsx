"use client";

import { cn } from "@4mica/ui";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { messages } from "@/i18n";

const RESET_MS = 1600;

export interface CopyValueProps {
  value: string;
  label?: string;
  mono?: boolean;
  className?: string;
}

export function CopyValue({ value, label, mono, className }: CopyValueProps) {
  const [copied, setCopied] = useState(false);
  const reduceMotion = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }

    setCopied(true);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setCopied(false), RESET_MS);
  };

  return (
    <button
      aria-label={
        copied
          ? messages.integration.copied
          : `${messages.integration.copy} ${label ?? value}`
      }
      className={cn(
        "group/copy relative -mx-1.5 inline-flex max-w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-overlay/5",
        className,
      )}
      onClick={copy}
      type="button"
    >
      <span
        className={cn(
          "min-w-0 truncate text-ink-body",
          mono && "font-mono text-sm",
        )}
      >
        {label ?? value}
      </span>

      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <AnimatePresence initial={false} mode="wait">
          {copied ? (
            <motion.span
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              initial={{ opacity: 0, scale: 0.7 }}
              key="done"
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 520, damping: 26 }
              }
            >
              <Check aria-hidden="true" className="h-3.5 w-3.5 text-success" />
            </motion.span>
          ) : (
            <motion.span
              animate={{ opacity: 1 }}
              className="text-ink-subtle opacity-0 transition-opacity group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key="idle"
              transition={{ duration: 0.12 }}
            >
              <Copy aria-hidden="true" className="h-3.5 w-3.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>

      <AnimatePresence>
        {copied && (
          <motion.span
            animate={{ opacity: 1, y: 0, scale: 1 }}
            aria-hidden="true"
            className="pointer-events-none absolute -top-7 left-1/2 z-10 rounded-md bg-ink-strong px-2 py-1 font-medium text-surface text-xs shadow-sm"
            exit={{ opacity: 0, y: -2, scale: 0.96 }}
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            style={{ x: "-50%" }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 500, damping: 30 }
            }
          >
            {messages.integration.copied}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
