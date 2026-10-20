"use client";

import { cn } from "@4mica/ui";
import {
  AnimatePresence,
  motion,
  type Transition,
  useReducedMotion,
} from "framer-motion";
import { Check } from "lucide-react";
import { type ComponentType, useEffect, useRef, useState } from "react";

const RESET_MS = 1600;

export interface GroupAction {
  id: string;
  label: string;
  ariaLabel?: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  run: () => Promise<string | null>;
}

export interface ActionGroupProps {
  label: string;
  actions: GroupAction[];
  iconOnly?: boolean;
  className?: string;
}

export const copyText = async (
  value: string,
  note: string,
): Promise<string | null> => {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    return null;
  }
  return note;
};

export function ActionGroup({
  label,
  actions,
  iconOnly = false,
  className,
}: ActionGroupProps) {
  const [done, setDone] = useState<{ id: string; note: string } | null>(null);
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

  const trigger = async ({ id, run }: GroupAction) => {
    const note = await run();
    if (!note) {
      return;
    }

    setDone({ id, note });
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setDone(null), RESET_MS);
  };

  const instant: Transition = { duration: 0 };
  const fade: Transition = reduceMotion
    ? instant
    : { duration: 0.12, ease: "easeOut" };
  const pop: Transition = reduceMotion
    ? instant
    : {
        opacity: { duration: 0.1, ease: "easeOut" },
        default: { type: "spring", stiffness: 700, damping: 32 },
      };

  return (
    <fieldset
      aria-label={label}
      className={cn(
        "m-0 inline-flex min-w-0 items-center gap-0.5 rounded-md border border-overlay/[0.06] p-0.5",
        className,
      )}
    >
      {actions.map((action) => {
        const { id, label: text, ariaLabel, icon: Icon } = action;
        const isDone = done?.id === id;

        return (
          <motion.button
            aria-label={isDone ? done.note : (ariaLabel ?? text)}
            className={cn(
              "relative inline-flex h-6 items-center gap-1.5 rounded text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/40",
              iconOnly ? "px-1.5" : "px-2",
              isDone
                ? "bg-success/10 text-ink-body"
                : "text-ink-muted hover:bg-overlay/[0.06] hover:text-ink-body",
            )}
            key={id}
            onClick={() => trigger(action)}
            title={iconOnly ? (ariaLabel ?? text) : undefined}
            type="button"
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
          >
            <span className="relative grid h-3.5 w-3.5 place-items-center">
              <motion.span
                animate={
                  isDone
                    ? { opacity: 0, scale: 0.5, rotate: 45 }
                    : { opacity: 1, scale: 1, rotate: 0 }
                }
                className="absolute inset-0 grid place-items-center"
                initial={false}
                transition={isDone ? fade : pop}
              >
                <Icon aria-hidden={true} className="h-3.5 w-3.5" />
              </motion.span>
              <motion.span
                animate={
                  isDone
                    ? { opacity: 1, scale: 1, rotate: 0 }
                    : { opacity: 0, scale: 0.5, rotate: -45 }
                }
                className="absolute inset-0 grid place-items-center"
                initial={false}
                transition={isDone ? pop : fade}
              >
                <Check
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-success"
                />
              </motion.span>
            </span>
            {!iconOnly && text}

            <AnimatePresence>
              {isDone && (
                <motion.span
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-7 left-1/2 z-10 whitespace-nowrap rounded-md bg-ink-strong px-2 py-1 font-medium text-surface text-xs shadow-sm"
                  exit={{ opacity: 0, y: -2, scale: 0.96, transition: fade }}
                  initial={{ opacity: 0, y: 4, scale: 0.9 }}
                  style={{ x: "-50%" }}
                  transition={pop}
                >
                  {done.note}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </fieldset>
  );
}
