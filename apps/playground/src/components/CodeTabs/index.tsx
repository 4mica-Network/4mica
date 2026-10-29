"use client";

import { cn } from "@4mica/ui";
import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useId, useState } from "react";

export interface CodeTabsProps {
  tabs: { id: string; label: string; content: ReactNode }[];
}

export function CodeTabs({ tabs }: CodeTabsProps) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const reduceMotion = useReducedMotion();
  const baseId = useId();

  return (
    <div className="flex flex-col gap-3">
      <div
        className="inline-flex items-center gap-0.5 self-start rounded-md border border-overlay/6 p-0.5"
        role="tablist"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;

          return (
            <button
              aria-controls={`${baseId}-${tab.id}`}
              aria-selected={selected}
              className={cn(
                "relative inline-flex h-6 items-center rounded px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/40",
                selected
                  ? "text-ink-body"
                  : "text-ink-muted hover:text-ink-body",
              )}
              id={`${baseId}-tab-${tab.id}`}
              key={tab.id}
              onClick={() => setActive(tab.id)}
              role="tab"
              type="button"
            >
              {selected && (
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-0 rounded bg-overlay/6"
                  layoutId={`${baseId}-pill`}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 500, damping: 38 }
                  }
                />
              )}
              <span className="relative">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== active}
          id={`${baseId}-${tab.id}`}
          key={tab.id}
          role="tabpanel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
