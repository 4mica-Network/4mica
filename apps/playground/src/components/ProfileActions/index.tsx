"use client";

import { cn } from "@4mica/ui";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Link2, Share2 } from "lucide-react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { messages } from "@/i18n";

const RESET_MS = 1600;

type ActionId = "copy" | "share";

export interface ProfileActionsProps {
  url: string;
  title: string;
}

export function ProfileActions({ url, title }: ProfileActionsProps) {
  const [done, setDone] = useState<{ id: ActionId; note: string } | null>(null);
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

  const flash = (id: ActionId, note: string) => {
    setDone({ id, note });
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setDone(null), RESET_MS);
  };

  const copyLink = async (id: ActionId) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }
    flash(id, messages.profile.linkCopied);
  };

  const share = async () => {
    if (typeof navigator.share !== "function") {
      await copyLink("share");
      return;
    }

    try {
      await navigator.share({ title, url });
    } catch {
      return;
    }
    flash("share", messages.profile.shared);
  };

  const actions: {
    id: ActionId;
    label: string;
    icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
    onClick: () => void;
  }[] = [
    {
      id: "copy",
      label: messages.profile.copyLink,
      icon: Link2,
      onClick: () => copyLink("copy"),
    },
    {
      id: "share",
      label: messages.profile.share,
      icon: Share2,
      onClick: share,
    },
  ];

  const spring = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 520, damping: 26 } as const);

  return (
    <fieldset
      aria-label={messages.profile.actions}
      className="m-0 inline-flex min-w-0 items-center gap-0.5 rounded-md border border-overlay/[0.06] p-0.5"
    >
      {actions.map(({ id, label, icon: Icon, onClick }) => {
        const isDone = done?.id === id;

        return (
          <button
            aria-label={isDone ? done.note : label}
            className={cn(
              "relative inline-flex h-6 items-center gap-1.5 rounded px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/40",
              isDone
                ? "text-ink-body"
                : "text-ink-subtle hover:bg-overlay/[0.06] hover:text-ink-body",
            )}
            key={id}
            onClick={onClick}
            type="button"
          >
            <span className="relative flex h-3.5 w-3.5 items-center justify-center">
              <AnimatePresence initial={false} mode="wait">
                {isDone ? (
                  <motion.span
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    initial={{ opacity: 0, scale: 0.7 }}
                    key="done"
                    transition={spring}
                  >
                    <Check
                      aria-hidden="true"
                      className="h-3.5 w-3.5 text-success"
                    />
                  </motion.span>
                ) : (
                  <motion.span
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    initial={{ opacity: 0, scale: 0.7 }}
                    key="idle"
                    transition={spring}
                  >
                    <Icon aria-hidden={true} className="h-3.5 w-3.5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            {label}

            <AnimatePresence>
              {isDone && (
                <motion.span
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-7 left-1/2 z-10 whitespace-nowrap rounded-md bg-ink-strong px-2 py-1 font-medium text-surface text-xs shadow-sm"
                  exit={{ opacity: 0, y: -2, scale: 0.96 }}
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  style={{ x: "-50%" }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 500, damping: 30 }
                  }
                >
                  {done.note}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        );
      })}
    </fieldset>
  );
}
