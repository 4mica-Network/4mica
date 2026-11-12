"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function CopyToast({ note }: { note: string | null }) {
  const [mounted, setMounted] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-50 flex justify-center px-4 md:hidden"
    >
      <AnimatePresence>
        {note && (
          <motion.span
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="max-w-full truncate rounded-full bg-ink-strong px-4 py-2 font-medium text-sm text-surface"
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 500, damping: 34 }
            }
          >
            {note}
          </motion.span>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
