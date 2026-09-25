import { Tag } from "@4mica/ui";
import { Route } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyValue } from "@/components/CopyValue";
import { EmptyState } from "@/components/EmptyState";
import { ApiIntegration } from "@/components/IntegrationSection/ApiIntegration";
import { JsonLd } from "@/components/JsonLd";
import { PayWithFourMica } from "@/components/PayWithFourMica";
import { PriceHeadline } from "@/components/PriceHeadline";
import { ProfileNav } from "@/components/ProfileNav";
import { Prose } from "@/components/Prose";
import { RevealLink } from "@/components/RevealLink";
import { SupportSection } from "@/components/SupportSection";
import { TrustSection } from "@/components/TrustSection";
import { VisibilityTag } from "@/components/VisibilityTag";
import { messages } from "@/i18n";
import { buildApiListingDescriptor } from "@/lib/descriptor";
import { getPayerState } from "@/services/payer";
import { resolveApiListing } from "@/services/resource";
import { buildApiListingMetadata, notFoundMetadata } from "@/services/seo";
import type { ProfileChildPageProps } from "@/types";
import { bareHost } from "@/utils/bareHost";
import { formatDate } from "@/utils/formatDate";

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

  return (
    <article className="flex flex-col gap-10">
      <JsonLd descriptor={descriptor} />

      <ProfileNav
        className="absolute top-4 left-4 z-20 sm:top-6 sm:left-8"
        displayName={profile.name || profile.username}
        username={profile.username}
      />

      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-semibold text-3xl text-ink-strong tracking-tight">
              {listing.name}
            </h1>
            {listing.category && (
              <Tag size="sm" variant="neutral">
                {listing.category}
              </Tag>
            )}
            {profile.isOwner && (
              <VisibilityTag visibility={listing.visibility} />
            )}
          </div>

          {listing.summary && (
            <p className="text-ink-muted leading-relaxed">{listing.summary}</p>
          )}
        </div>

        <PriceHeadline
          amount={listing.priceAmount}
          assetAddress={listing.assetAddress}
          currency={listing.priceCurrency}
          label={listing.priceLabel}
          network={listing.network}
        />

        <dl className="flex flex-col gap-2 border-overlay/10 border-t pt-4 text-sm">
          {listing.baseUrl && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <dt className="w-24 shrink-0 text-ink-subtle">
                {messages.api.baseUrl}
              </dt>
              <dd className="min-w-0 flex-1">
                <CopyValue mono value={listing.baseUrl} />
              </dd>
            </div>
          )}

          {listing.payToAddress && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <dt className="w-24 shrink-0 text-ink-subtle">
                {messages.api.paidTo}
              </dt>
              <dd className="min-w-0 flex-1">
                <CopyValue mono value={listing.payToAddress} />
              </dd>
            </div>
          )}

          {listing.publishedAt && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <dt className="w-24 shrink-0 text-ink-subtle">
                {messages.api.publishedLabel}
              </dt>
              <dd className="min-w-0 flex-1 text-ink-body">
                {formatDate(listing.publishedAt)}
              </dd>
            </div>
          )}

          {listing.docsUrl && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <dt className="w-24 shrink-0 text-ink-subtle">
                {messages.api.docsLabel}
              </dt>
              <dd className="min-w-0 flex-1">
                <RevealLink external href={listing.docsUrl}>
                  {bareHost(listing.docsUrl)}
                </RevealLink>
              </dd>
            </div>
          )}
        </dl>
      </header>

      {listing.description && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-ink-strong text-lg tracking-tight">
            {messages.api.aboutHeading}
          </h2>
          <Prose text={listing.description} />
        </section>
      )}

      {(listing.endpoints.length > 0 || profile.isOwner) && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold text-ink-strong text-lg tracking-tight">
              {messages.api.endpointsHeading}
            </h2>
            <p className="text-ink-muted text-sm">
              {messages.api.endpointsLead}
            </p>
          </div>

          {listing.endpoints.length === 0 ? (
            <EmptyState
              description={messages.api.noEndpointsBody}
              icon={<Route className="h-4 w-4" />}
              title={messages.api.noEndpointsTitle}
            />
          ) : (
            <ul className="flex flex-col border-overlay/10 border-t">
              {listing.endpoints.map((endpoint) => (
                <li
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-overlay/10 border-b py-3"
                  key={endpoint.id}
                >
                  <code className="font-mono text-ink-strong text-sm">
                    <span className="text-ink-subtle">{endpoint.method}</span>{" "}
                    {endpoint.path}
                  </code>
                  {endpoint.summary && (
                    <span className="min-w-0 flex-1 text-ink-muted text-sm">
                      {endpoint.summary}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <TrustSection
        id={listing.id}
        kind="listing"
        profile={profile}
        publishedAt={listing.publishedAt}
        resourceRef={listing.ref}
      />

      {!profile.isOwner && (
        <PayWithFourMica network={listing.network} state={payerState} />
      )}

      <ApiIntegration isOwner={profile.isOwner} listing={listing} />

      <SupportSection profile={profile} resourceName={listing.name} />

      {listing.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-overlay/10 border-t pt-6">
          {listing.tags.map((tag) => (
            <Tag key={tag} size="sm">
              {tag}
            </Tag>
          ))}
        </div>
      )}
    </article>
  );
}
