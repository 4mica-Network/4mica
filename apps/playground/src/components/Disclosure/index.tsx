"use client";

import { cn } from "@4mica/ui";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

export interface DisclosureProps {
  index: number;
  title: string;
  lead?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function Disclosure({
  index,
  title,
  lead,
  children,
  defaultOpen = false,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const reduceMotion = useReducedMotion();
  const panelId = useId();

  return (
    <li className="group border-overlay/10 border-b last:border-b-0">
      <h3>
        <button
          aria-controls={panelId}
          aria-expanded={open}
          className="flex w-full items-center gap-4 py-4 text-left transition-opacity hover:opacity-90"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-2xs transition-colors duration-200",
              open
                ? "border-brand/40 bg-brand/10 text-ink-strong"
                : "border-overlay/10 bg-overlay/5 text-ink-subtle",
            )}
          >
            {index}
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-medium text-ink-strong text-sm">{title}</span>
            {lead && (
              <span className="text-ink-muted text-xs leading-relaxed">
                {lead}
              </span>
            )}
          </span>

          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            aria-hidden="true"
            className="shrink-0 text-ink-subtle"
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 420, damping: 32 }
            }
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    height: { type: "spring", stiffness: 260, damping: 34 },
                    opacity: { duration: 0.18 },
                  }
            }
          >
            <motion.div
              animate={{ y: 0 }}
              className="pb-5 pl-10"
              initial={reduceMotion ? false : { y: -4 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function DisclosureList({ children }: { children: ReactNode }) {
  return (
    <ol className="flex flex-col border-overlay/10 border-t">{children}</ol>
  );
}
