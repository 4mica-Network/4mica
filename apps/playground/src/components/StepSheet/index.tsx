"use client";

import {
  AnimatePresence,
  m,
  useDragControls,
  useReducedMotion,
} from "framer-motion";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { messages } from "@/i18n";

const FOCUSABLE =
  'button:not([disabled]), a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

export interface StepSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function StepSheet({ open, onClose, title, children }: StepSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusable = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    const current = panel?.querySelector<HTMLElement>("[aria-current]");
    (current ?? focusable()[0] ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  const slide = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 420, damping: 40 };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <m.div
            animate={{ opacity: 1 }}
            aria-hidden="true"
            className="absolute inset-0 bg-surface-deep/70"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onClose}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          />

          <m.div
            animate={{ y: 0 }}
            aria-labelledby={titleId}
            aria-modal="true"
            className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col rounded-t-2xl bg-surface-solid pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] outline-none"
            drag={reduceMotion ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragControls={dragControls}
            dragElastic={{ top: 0, bottom: 0.7 }}
            dragListener={false}
            exit={{ y: "100%" }}
            initial={{ y: "100%" }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 96 || info.velocity.y > 480) {
                onClose();
              }
            }}
            ref={panelRef}
            role="dialog"
            tabIndex={-1}
            transition={slide}
          >
            <div
              className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-2 active:cursor-grabbing"
              onPointerDown={(event) => dragControls.start(event)}
            >
              <span
                aria-hidden="true"
                className="h-1 w-9 rounded-full bg-overlay/15"
              />
              <div className="flex h-12 w-full items-center justify-between pr-2 pl-5">
                <h2
                  className="font-semibold text-ink-strong text-sm"
                  id={titleId}
                >
                  {title}
                </h2>
                <button
                  aria-label={messages.flow.closeSteps}
                  className="grid h-10 w-10 place-items-center rounded-full text-ink-muted transition-colors active:bg-overlay/6"
                  onClick={onClose}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
              {children}
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
