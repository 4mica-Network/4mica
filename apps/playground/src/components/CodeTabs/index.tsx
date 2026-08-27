"use client";

import { TabGroup } from "@4mica/ui";
import { type ReactNode, useState } from "react";

export interface CodeTabsProps {
  /**
   * Panels are server-rendered `CodeBlock`s passed as slots, so shiki stays on
   * the server — the same arrangement ProfileTabs uses for its lists.
   */
  tabs: { id: string; label: string; content: ReactNode }[];
}

/**
 * Language switcher for a set of equivalent snippets.
 *
 * `TabGroup` renders panels only in controlled mode, hence the local state. Its
 * overflow fades are `from-surface-deep`, so this belongs on the page
 * background — never inside a `.code-surface` frame.
 */
export function CodeTabs({ tabs }: CodeTabsProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");

  return (
    <TabGroup
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabs={tabs}
      wrapperClassName="gap-2"
    />
  );
}
