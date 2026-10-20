"use client";

import { cn } from "@4mica/ui";
import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useState } from "react";
import { messages } from "@/i18n";

export interface ProfileTabsProps {
  agentCount: number;
  apiCount: number;
  agents: ReactNode;
  apis: ReactNode;
}

type TabId = "agents" | "apis";

export function ProfileTabs({
  agentCount,
  apiCount,
  agents,
  apis,
}: ProfileTabsProps) {
  const [active, setActive] = useState<TabId>("agents");
  const reduceMotion = useReducedMotion();

  const tabs = [
    { id: "agents", label: messages.profile.agentsHeading, count: agentCount },
    { id: "apis", label: messages.profile.apisHeading, count: apiCount },
  ] as const;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center border-overlay/10 border-b px-2">
        <div
          className="inline-flex items-center gap-0.5 rounded-md border border-overlay/[0.06] p-0.5"
          role="tablist"
        >
          {tabs.map((tab) => {
            const selected = tab.id === active;

            return (
              <button
                aria-controls={`profile-panel-${tab.id}`}
                aria-selected={selected}
                className={cn(
                  "relative inline-flex h-6 items-center gap-1.5 rounded px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/40",
                  selected
                    ? "text-ink-body"
                    : "text-ink-subtle hover:text-ink-body",
                )}
                id={`profile-tab-${tab.id}`}
                key={tab.id}
                onClick={() => setActive(tab.id)}
                role="tab"
                type="button"
              >
                {selected && (
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded bg-overlay/[0.06]"
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

      <div
        aria-labelledby={`profile-tab-${active}`}
        className="flex min-h-0 flex-1 flex-col"
        id={`profile-panel-${active}`}
        role="tabpanel"
      >
        {active === "agents" ? agents : apis}
      </div>
    </div>
  );
}
