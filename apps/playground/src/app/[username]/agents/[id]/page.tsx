import { Tag } from "@4mica/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { AgentIntegration } from "@/components/IntegrationSection/AgentIntegration";
import { ProfileNav } from "@/components/ProfileNav";
import { Prose } from "@/components/Prose";
import { VisibilityTag } from "@/components/VisibilityTag";
import { messages, t } from "@/i18n";
import { parseIdOrSlug, parseUsername } from "@/schema/params";
import { getPublicAgent } from "@/services/agents";
import { getPublicProfile } from "@/services/profile";
import { buildAgentMetadata, notFoundMetadata } from "@/services/seo";
import type { ProfileChildPageProps } from "@/types";
import { formatDate } from "@/utils/formatDate";

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

const resolve = async (raw: { username: string; id: string }) => {
  const username = parseUsername(raw.username);
  const ref = parseIdOrSlug(raw.id);

  if (!username || !ref) {
    return null;
  }

  const result = await getPublicProfile(username);

  if (!result) {
    return null;
  }

  const agent = await getPublicAgent(
    result.ownerId,
    ref,
    result.profile.isOwner,
  );

  return agent ? { profile: result.profile, agent } : null;
};

export async function generateMetadata({
  params,
}: ProfileChildPageProps): Promise<Metadata> {
  const resolved = await resolve(await params);

  return resolved
    ? buildAgentMetadata(resolved.profile, resolved.agent)
    : notFoundMetadata();
}

export default async function AgentPage({ params }: ProfileChildPageProps) {
  const resolved = await resolve(await params);

  if (!resolved) {
    notFound();
  }

  const { agent, profile } = resolved;

  return (
    <article className="flex flex-col gap-6">
      <ProfileNav
        displayName={profile.name || profile.username}
        username={profile.username}
      />

      <header className="flex items-start gap-4">
        <Avatar
          name={agent.name}
          size="xl"
          src={agent.avatarUrl}
          username={agent.ref}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-semibold text-2xl text-ink-strong">
              {agent.name}
            </h1>
            {profile.isOwner && <VisibilityTag visibility={agent.visibility} />}
          </div>
          {agent.headline && <p className="text-ink-muted">{agent.headline}</p>}
          <p className="text-ink-subtle text-sm">
            {t(messages.agent.operatedBy, { username: profile.username })}
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-overlay/10 px-5 py-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-ink-subtle text-xs uppercase tracking-wide">
            {messages.agent.status}
          </dt>
          <dd>
            <Tag size="sm" variant={STATUS_VARIANT[agent.status]}>
              {STATUS_LABEL[agent.status]}
            </Tag>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-ink-subtle text-xs uppercase tracking-wide">
            {messages.agent.registered}
          </dt>
          <dd className="text-ink-body text-sm">
            {formatDate(agent.createdAt)}
          </dd>
        </div>
      </dl>

      {agent.description && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-ink-strong text-lg">
            {messages.agent.aboutHeading}
          </h2>
          <Prose text={agent.description} />
        </section>
      )}

      <AgentIntegration agent={agent} />
    </article>
  );
}
