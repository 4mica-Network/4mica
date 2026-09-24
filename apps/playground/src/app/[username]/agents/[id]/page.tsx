import { Tag, Link as UiLink } from "@4mica/ui";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CopyValue } from "@/components/CopyValue";
import { AgentIntegration } from "@/components/IntegrationSection/AgentIntegration";
import { PayWithFourMica } from "@/components/PayWithFourMica";
import { PriceHeadline } from "@/components/PriceHeadline";
import { ProfileNav } from "@/components/ProfileNav";
import { Prose } from "@/components/Prose";
import { VisibilityTag } from "@/components/VisibilityTag";
import { messages, t } from "@/i18n";
import { isSellable } from "@/lib/snippets/agent";
import { parseIdOrSlug, parseUsername } from "@/schema/params";
import { getPublicAgent } from "@/services/agents";
import { getPayerState } from "@/services/payer";
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
  const payerState = await getPayerState(agent.network);

  return (
    <article className="flex flex-col gap-10">
      <ProfileNav
        className="absolute top-4 left-4 z-20 sm:top-6 sm:left-8"
        displayName={profile.name || profile.username}
        username={profile.username}
      />

      <header className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <Avatar
            name={agent.name}
            size="xl"
            src={agent.avatarUrl}
            username={agent.ref}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-semibold text-3xl text-ink-strong tracking-tight">
                {agent.name}
              </h1>
              <Tag size="sm" variant={STATUS_VARIANT[agent.status]}>
                {STATUS_LABEL[agent.status]}
              </Tag>
              {profile.isOwner && (
                <VisibilityTag visibility={agent.visibility} />
              )}
            </div>
            {agent.headline && (
              <p className="text-ink-muted leading-relaxed">{agent.headline}</p>
            )}
            <p className="text-ink-subtle text-sm">
              {t(messages.agent.operatedBy, { username: profile.username })}
            </p>
          </div>
        </div>

        {isSellable(agent) && (
          <PriceHeadline
            amount={agent.priceAmount}
            assetAddress={agent.assetAddress}
            currency={agent.priceCurrency}
            label={agent.priceLabel}
            network={agent.network}
          />
        )}

        <dl className="flex flex-col gap-2 border-overlay/10 border-t pt-4 text-sm">
          {agent.endpointUrl && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <dt className="w-24 shrink-0 text-ink-subtle">
                {messages.agent.endpointLabel}
              </dt>
              <dd className="min-w-0 flex-1">
                <CopyValue mono value={agent.endpointUrl} />
              </dd>
            </div>
          )}

          {agent.payToAddress && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <dt className="w-24 shrink-0 text-ink-subtle">
                {messages.agent.paidTo}
              </dt>
              <dd className="min-w-0 flex-1">
                <CopyValue mono value={agent.payToAddress} />
              </dd>
            </div>
          )}

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <dt className="w-24 shrink-0 text-ink-subtle">
              {messages.agent.registered}
            </dt>
            <dd className="min-w-0 flex-1 text-ink-body">
              {formatDate(agent.createdAt)}
            </dd>
          </div>

          {agent.docsUrl && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <dt className="w-24 shrink-0 text-ink-subtle">
                {messages.agent.docsLabel}
              </dt>
              <dd className="min-w-0 flex-1">
                <UiLink
                  className="text-sm"
                  external
                  href={agent.docsUrl}
                  icon={<ExternalLink aria-hidden="true" className="h-4 w-4" />}
                >
                  {messages.common.viewDocs}
                </UiLink>
              </dd>
            </div>
          )}
        </dl>
      </header>

      {agent.description && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-ink-strong text-lg tracking-tight">
            {messages.agent.aboutHeading}
          </h2>
          <Prose text={agent.description} />
        </section>
      )}

      {!profile.isOwner && (
        <PayWithFourMica network={agent.network} state={payerState} />
      )}

      <AgentIntegration agent={agent} isOwner={profile.isOwner} />
    </article>
  );
}
