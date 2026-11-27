"use client";

import { cn } from "@4mica/ui";
import { m, useReducedMotion } from "framer-motion";
import { type KeyboardEvent, type ReactNode, useState } from "react";
import { messages } from "@/i18n";
import { nextTabIndex } from "@/utils/tabKeys";

export interface ProfileTabsProps {
  agentCount: number;
  apiCount: number;
  agents: ReactNode;
  apis: ReactNode;
}

type TabId = "agents" | "apis";

const tabId = (id: TabId) => `profile-tab-${id}`;
const panelId = (id: TabId) => `profile-panel-${id}`;

export function ProfileTabs({
  agentCount,
  apiCount,
  agents,
  apis,
}: ProfileTabsProps) {
  const [active, setActive] = useState<TabId>("agents");
  const reduceMotion = useReducedMotion();

  const tabs = [
    {
      id: "agents",
      label: messages.profile.agentsHeading,
      count: agentCount,
      content: agents,
    },
    {
      id: "apis",
      label: messages.profile.apisHeading,
      count: apiCount,
      content: apis,
    },
  ] as const;

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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 flex h-14 shrink-0 items-center border-overlay/10 border-b bg-surface-deep px-4 md:static md:h-12 md:bg-transparent md:px-2">
        <div
          aria-label={messages.profile.tabsLabel}
          className="flex w-full items-center gap-0.5 rounded-lg border border-overlay/6 p-0.5 md:inline-flex md:w-auto md:rounded-md"
          onKeyDown={onKeyDown}
          role="tablist"
        >
          {tabs.map((tab) => {
            const selected = tab.id === active;

            return (
              <button
                aria-controls={panelId(tab.id)}
                aria-selected={selected}
                className={cn(
                  "relative inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm transition-colors md:h-6 md:flex-none md:justify-start md:rounded md:text-xs",
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
                    className="absolute inset-0 rounded-md bg-overlay/6 md:rounded"
                    layoutId="profile-tab-pill"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 500, damping: 38 }
                    }
                  />
                )}
                <span className="relative">{tab.label}</span>
                <span className="relative text-ink-subtle tabular-nums">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {tabs.map((tab) => (
        <div
          aria-labelledby={tabId(tab.id)}
          className="focus-inset flex flex-1 flex-col md:min-h-0 md:overflow-y-auto"
          hidden={tab.id !== active}
          id={panelId(tab.id)}
          key={tab.id}
          role="tabpanel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
