"use client";

import { cn } from "@4mica/ui";
import { m, useReducedMotion } from "framer-motion";
import { type KeyboardEvent, type ReactNode, useId, useState } from "react";
import { messages } from "@/i18n";
import { nextTabIndex } from "@/utils/tabKeys";

export interface CodeTabsProps {
  tabs: { id: string; label: string; content: ReactNode }[];
  label?: string;
}

export function CodeTabs({
  tabs,
  label = messages.integration.languageTabs,
}: CodeTabsProps) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const reduceMotion = useReducedMotion();
  const baseId = useId();
  const tabId = (id: string) => `${baseId}-tab-${id}`;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((tab) => tab.id === active);
    const next = nextTabIndex(event.key, current, tabs.length);
    const target = next === null ? undefined : tabs[next];
    if (!target) {
      return;
    }
    event.preventDefault();
    setActive(target.id);
    document.getElementById(tabId(target.id))?.focus();
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-label={label}
        className="inline-flex items-center gap-0.5 self-start rounded-md border border-overlay/6 p-0.5"
        onKeyDown={onKeyDown}
        role="tablist"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;

          return (
            <button
              aria-controls={`${baseId}-${tab.id}`}
              aria-selected={selected}
              className={cn(
                "relative inline-flex h-9 items-center rounded px-3 text-sm transition-colors md:h-6 md:px-2 md:text-xs",
                selected
                  ? "text-ink-body"
                  : "text-ink-muted hover:text-ink-body",
              )}
              id={tabId(tab.id)}
              key={tab.id}
              onClick={() => setActive(tab.id)}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {selected && (
                <m.span
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
          aria-labelledby={tabId(tab.id)}
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
