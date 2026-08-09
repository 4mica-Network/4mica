import { Card, Tag } from "@4mica/ui";
import Link from "next/link";
import { messages } from "@/i18n";
import type { PublicAgent } from "@/types";
import { agentPath } from "@/utils/profileUrl";
import { Avatar } from "./Avatar";
import { VisibilityToggle } from "./VisibilityToggle";

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

export interface AgentCardProps {
  agent: PublicAgent;
  username: string;
  isOwner: boolean;
}

export function AgentCard({ agent, username, isOwner }: AgentCardProps) {
  return (
    <div className="flex flex-col">
      <Link
        className="rounded-lg transition-colors hover:bg-overlay/5 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        href={agentPath(username, agent.ref)}
      >
        <Card className="h-full gap-3">
          <div className="flex items-start gap-3">
            <Avatar
              name={agent.name}
              size="md"
              src={agent.avatarUrl}
              username={agent.ref}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-semibold text-ink-strong">
                  {agent.name}
                </h3>
                <Tag size="sm" variant={STATUS_VARIANT[agent.status]}>
                  {STATUS_LABEL[agent.status]}
                </Tag>
              </div>
              {agent.headline && (
                <p className="line-clamp-2 text-ink-muted text-sm">
                  {agent.headline}
                </p>
              )}
            </div>
          </div>
        </Card>
      </Link>
      {isOwner && (
        <div className="px-6 pt-2">
          <VisibilityToggle
            current={agent.visibility}
            id={agent.id}
            kind="agent"
          />
        </div>
      )}
    </div>
  );
}
