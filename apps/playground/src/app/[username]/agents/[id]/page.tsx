import { Tag } from "@4mica/ui";
import { BookText, CalendarDays, Globe, UserRound, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CardShell } from "@/components/CardShell";
import { CopyValue } from "@/components/CopyValue";
import {
  buildAgentBuyerSteps,
  buildAgentRunSteps,
} from "@/components/IntegrationSection/AgentIntegration";
import { JsonLd } from "@/components/JsonLd";
import { PayWithFourMica } from "@/components/PayWithFourMica";
import { PriceHeadline, pricingNote } from "@/components/PriceHeadline";
import { ProfileActions } from "@/components/ProfileActions";
import { ProfileNav } from "@/components/ProfileNav";
import { Prose } from "@/components/Prose";
import {
  type Fact,
  paymentFacts,
  ResourceFacts,
} from "@/components/ResourceFacts";
import { RevealLink } from "@/components/RevealLink";
import { type FlowStep, StepFlow } from "@/components/StepFlow";
import { SupportSection } from "@/components/SupportSection";
import { TrustSection } from "@/components/TrustSection";
import { VisibilityTag } from "@/components/VisibilityTag";
import { messages } from "@/i18n";
import { buildAgentDescriptor } from "@/lib/descriptor";
import { isSellable } from "@/lib/snippets/agent";
import { links } from "@/services/links";
import { getPayerState } from "@/services/payer";
import { resolveAgent } from "@/services/resource";
import { buildAgentMetadata, notFoundMetadata } from "@/services/seo";
import type { ProfileChildPageProps } from "@/types";
import { bareHost } from "@/utils/bareHost";
import { formatDate } from "@/utils/formatDate";
import { agentPath, profilePath } from "@/utils/profileUrl";

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

export async function generateMetadata({
  params,
}: ProfileChildPageProps): Promise<Metadata> {
  const resolved = await resolveAgent(await params);

  return resolved
    ? buildAgentMetadata(resolved.profile, resolved.agent)
    : notFoundMetadata();
}

export default async function AgentPage({ params }: ProfileChildPageProps) {
  const resolved = await resolveAgent(await params);

  if (!resolved) {
    notFound();
  }

  const { agent, profile } = resolved;
  const payerState = await getPayerState(agent.network);
  const descriptor = buildAgentDescriptor(agent, profile);

  const price = {
    amount: agent.priceAmount,
    currency: agent.priceCurrency,
    label: agent.priceLabel,
  };

  const facts: Fact[] = [
    ...(agent.endpointUrl
      ? [
          {
            id: "endpoint",
            hint: messages.facts.hint.endpoint,
            icon: Globe,
            label: messages.agent.endpointLabel,
            value: <CopyValue mono value={agent.endpointUrl} />,
          },
        ]
      : []),
    ...(isSellable(agent)
      ? paymentFacts({
          network: agent.network,
          assetAddress: agent.assetAddress,
          note: pricingNote(price),
        })
      : []),
    ...(agent.payToAddress
      ? [
          {
            id: "pay-to",
            hint: messages.facts.hint.payTo,
            icon: Wallet,
            label: messages.agent.paidTo,
            value: <CopyValue mono value={agent.payToAddress} />,
          },
        ]
      : []),
    ...(agent.docsUrl
      ? [
          {
            id: "docs",
            hint: messages.facts.hint.docs,
            icon: BookText,
            label: messages.agent.docsLabel,
            value: (
              <RevealLink external href={agent.docsUrl}>
                {bareHost(agent.docsUrl)}
              </RevealLink>
            ),
          },
        ]
      : []),
    {
      id: "operator",
      hint: messages.facts.hint.operator,
      icon: UserRound,
      label: messages.facts.operator,
      value: (
        <Link className="link-muted" href={profilePath(profile.username)}>
          @{profile.username}
        </Link>
      ),
    },
    {
      id: "registered",
      hint: messages.facts.hint.registered,
      icon: CalendarDays,
      label: messages.agent.registered,
      value: formatDate(agent.createdAt),
    },
  ];

  const overview: FlowStep = {
    id: "overview",
    title: messages.flow.overview,
    icon: "overview",
    content: <ResourceFacts facts={facts} />,
  };

  const about: FlowStep[] = [
    ...(agent.description
      ? [
          {
            id: "about",
            title: messages.agent.aboutHeading,
            icon: "about" as const,
            content: <Prose text={agent.description} />,
          },
        ]
      : []),
  ];

  const setup: FlowStep[] = profile.isOwner
    ? []
    : [
        {
          id: "setup",
          title: messages.flow.setup,
          done: payerState.step === "ready",
          content: (
            <PayWithFourMica network={agent.network} state={payerState} />
          ),
        },
      ];

  const reviews: FlowStep = {
    id: "reviews",
    title: messages.flow.reviews,
    icon: "reviews",
    content: (
      <TrustSection
        id={agent.id}
        kind="agent"
        profile={profile}
        publishedAt={agent.publishedAt}
        resourceRef={agent.ref}
      />
    ),
  };

  const support: FlowStep = {
    id: "support",
    title: messages.flow.support,
    icon: "support",
    content: <SupportSection profile={profile} resourceName={agent.name} />,
  };

  return (
    <>
      <JsonLd descriptor={descriptor} />

      <ProfileNav
        className="absolute top-4 left-4 z-20 sm:top-6 sm:left-8"
        displayName={profile.name || profile.username}
        username={profile.username}
      />

      <CardShell
        actions={
          <ProfileActions
            label={messages.flow.actions}
            title={agent.name}
            url={`${links.website}${agentPath(profile.username, agent.ref)}`}
          />
        }
      >
        <StepFlow
          groups={[
            { id: "overview", steps: [overview] },
            {
              id: "call",
              label: messages.integration.agentBuyerHeading,
              icon: "integrate",
              numbered: true,
              collapsible: true,
              steps: [
                ...setup,
                ...buildAgentBuyerSteps(agent, profile.isOwner),
              ],
            },
            {
              id: "run",
              label: messages.integration.agentRunHeading,
              icon: "run",
              numbered: true,
              collapsible: true,
              steps: buildAgentRunSteps(agent, profile.isOwner),
            },
            { id: "more", steps: [...about, reviews, support] },
          ]}
          identity={
            <header className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Avatar
                  name={agent.name}
                  size="md"
                  src={agent.avatarUrl}
                  username={agent.ref}
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <h1 className="font-semibold text-ink-strong text-lg leading-tight">
                    {agent.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Tag size="sm" variant={STATUS_VARIANT[agent.status]}>
                      {STATUS_LABEL[agent.status]}
                    </Tag>
                    {profile.isOwner && (
                      <VisibilityTag visibility={agent.visibility} />
                    )}
                  </div>
                </div>
              </div>

              {agent.headline && (
                <p className="text-ink-muted text-sm leading-relaxed">
                  {agent.headline}
                </p>
              )}

              {isSellable(agent) && <PriceHeadline {...price} />}
            </header>
          }
        />
      </CardShell>
    </>
  );
}
