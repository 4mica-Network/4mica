"use client";

import { TabGroup } from "@4mica/ui";
import { type ReactNode, useState } from "react";
import { messages } from "@/i18n";

export interface ProfileTabsProps {
  agentCount: number;
  apiCount: number;
  /** Server-rendered panels, passed as slots so the lists stay on the server. */
  agents: ReactNode;
  apis: ReactNode;
}

const AGENTS = "agents";
const APIS = "apis";

export function ProfileTabs({
  agentCount,
  apiCount,
  agents,
  apis,
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState(AGENTS);

  return (
    <TabGroup
      activeTab={activeTab}
      onTabChange={setActiveTab}
      wrapperClassName="gap-3"
      tabs={[
        {
          id: AGENTS,
          label: `${messages.profile.agentsHeading} (${agentCount})`,
          content: agents,
        },
        {
          id: APIS,
          label: `${messages.profile.apisHeading} (${apiCount})`,
          content: apis,
        },
      ]}
    />
  );
}
