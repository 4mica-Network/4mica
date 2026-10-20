import { Tag } from "@4mica/ui";
import { BookText, CalendarDays, Globe, Shapes, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardShell } from "@/components/CardShell";
import { CopyValue } from "@/components/CopyValue";
import { buildApiIntegrationSteps } from "@/components/IntegrationSection/ApiIntegration";
import { JsonLd } from "@/components/JsonLd";
import { MethodTag } from "@/components/MethodTag";
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
import { buildApiListingDescriptor } from "@/lib/descriptor";
import { links } from "@/services/links";
import { getPayerState } from "@/services/payer";
import { resolveApiListing } from "@/services/resource";
import { buildApiListingMetadata, notFoundMetadata } from "@/services/seo";
import type { ProfileChildPageProps } from "@/types";
import { bareHost } from "@/utils/bareHost";
import { formatDate } from "@/utils/formatDate";
import { apiListingPath } from "@/utils/profileUrl";

export async function generateMetadata({
  params,
}: ProfileChildPageProps): Promise<Metadata> {
  const resolved = await resolveApiListing(await params);

  return resolved
    ? buildApiListingMetadata(resolved.profile, resolved.listing)
    : notFoundMetadata();
}

export default async function ApiListingPage({
  params,
}: ProfileChildPageProps) {
  const resolved = await resolveApiListing(await params);

  if (!resolved) {
    notFound();
  }

  const { listing, profile } = resolved;
  const payerState = await getPayerState(listing.network);
  const descriptor = buildApiListingDescriptor(listing, profile);

  const price = {
    amount: listing.priceAmount,
    currency: listing.priceCurrency,
    label: listing.priceLabel,
  };

  const facts: Fact[] = [
    ...(listing.url
      ? [
          {
            id: "endpoint",
            hint: messages.facts.hint.endpoint,
            icon: Globe,
            label: messages.api.endpointLabel,
            value: (
              <span className="flex min-w-0 items-center gap-2">
                <MethodTag method={listing.method} />
                <CopyValue className="min-w-0" mono value={listing.url} />
              </span>
            ),
          },
        ]
      : []),
    ...paymentFacts({
      network: listing.network,
      assetAddress: listing.assetAddress,
      note: pricingNote(price),
    }),
    ...(listing.payToAddress
      ? [
          {
            id: "pay-to",
            hint: messages.facts.hint.payTo,
            icon: Wallet,
            label: messages.api.paidTo,
            value: <CopyValue mono value={listing.payToAddress} />,
          },
        ]
      : []),
    ...(listing.docsUrl
      ? [
          {
            id: "docs",
            hint: messages.facts.hint.docs,
            icon: BookText,
            label: messages.api.docsLabel,
            value: (
              <RevealLink external href={listing.docsUrl}>
                {bareHost(listing.docsUrl)}
              </RevealLink>
            ),
          },
        ]
      : []),
    ...(listing.category
      ? [
          {
            id: "category",
            hint: messages.facts.hint.category,
            icon: Shapes,
            label: messages.api.category,
            value: listing.category,
          },
        ]
      : []),
    ...(listing.publishedAt
      ? [
          {
            id: "published",
            hint: messages.facts.hint.published,
            icon: CalendarDays,
            label: messages.api.publishedLabel,
            value: formatDate(listing.publishedAt),
          },
        ]
      : []),
  ];

  const overview: FlowStep = {
    id: "overview",
    title: messages.flow.overview,
    icon: "overview",
    content: <ResourceFacts facts={facts} />,
  };

  const about: FlowStep[] = [
    ...(listing.description
      ? [
          {
            id: "about",
            title: messages.api.aboutHeading,
            icon: "about" as const,
            content: <Prose text={listing.description} />,
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
            <PayWithFourMica network={listing.network} state={payerState} />
          ),
        },
      ];

  const reviews: FlowStep = {
    id: "reviews",
    title: messages.flow.reviews,
    icon: "reviews",
    content: (
      <TrustSection
        id={listing.id}
        kind="listing"
        profile={profile}
        publishedAt={listing.publishedAt}
        resourceRef={listing.ref}
      />
    ),
  };

  const support: FlowStep = {
    id: "support",
    title: messages.flow.support,
    icon: "support",
    content: <SupportSection profile={profile} resourceName={listing.name} />,
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
            title={listing.name}
            url={`${links.website}${apiListingPath(profile.username, listing.ref)}`}
          />
        }
      >
        <StepFlow
          groups={[
            { id: "overview", steps: [overview] },
            {
              id: "integrate",
              label: messages.flow.integrate,
              icon: "integrate",
              numbered: true,
              collapsible: true,
              steps: [
                ...setup,
                ...buildApiIntegrationSteps(listing, profile.isOwner),
              ],
            },
            { id: "more", steps: [...about, reviews, support] },
          ]}
          identity={
            <header className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-semibold text-ink-strong text-xl">
                    {listing.name}
                  </h1>
                  {profile.isOwner && (
                    <VisibilityTag visibility={listing.visibility} />
                  )}
                </div>

                {listing.summary && (
                  <p className="text-ink-muted text-sm leading-relaxed">
                    {listing.summary}
                  </p>
                )}
              </div>

              <PriceHeadline {...price} />

              {listing.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {listing.tags.map((tag) => (
                    <Tag key={tag} size="sm" variant="neutral">
                      {tag}
                    </Tag>
                  ))}
                </div>
              )}
            </header>
          }
        />
      </CardShell>
    </>
  );
}
