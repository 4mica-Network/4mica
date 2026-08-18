import { Tag } from "@4mica/ui";
import { ListRow } from "@/components/ListRow";
import { VisibilityTag } from "@/components/VisibilityTag";
import { VisibilityToggle } from "@/components/VisibilityToggle";
import { messages } from "@/i18n";
import type { PublicAgent } from "@/types";
import { agentPath } from "@/utils/profileUrl";

const STATUS_VARIANT = {
  ACTIVE: "success",
  PENDING: "warning",
  SUSPENDED: "error",
} as const;

const STATUS_LABEL = {
  ACTIVE: messages.agent.statusActive,
  PENDING: messages.agent.statusPending,
  SUSPENDED: messages.agent.statusSuspended,
} as const;

export interface AgentRowProps {
  agent: PublicAgent;
  username: string;
  isOwner: boolean;
}

export function AgentRow({ agent, username, isOwner }: AgentRowProps) {
  return (
    <ListRow
      href={agentPath(username, agent.ref)}
      title={agent.name}
      description={agent.headline}
      tags={
        <>
          <Tag size="sm" variant={STATUS_VARIANT[agent.status]}>
            {STATUS_LABEL[agent.status]}
          </Tag>
          {isOwner && <VisibilityTag visibility={agent.visibility} />}
        </>
      }
      action={
        isOwner && (
          <VisibilityToggle
            current={agent.visibility}
            id={agent.id}
            kind="agent"
          />
        )
      }
    />
  );
}
