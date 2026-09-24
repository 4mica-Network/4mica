import { Tag, Link as UiLink } from "@4mica/ui";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyValue } from "@/components/CopyValue";
import { ApiIntegration } from "@/components/IntegrationSection/ApiIntegration";
import { PayWithFourMica } from "@/components/PayWithFourMica";
import { PriceHeadline } from "@/components/PriceHeadline";
import { ProfileNav } from "@/components/ProfileNav";
import { Prose } from "@/components/Prose";
import { VisibilityTag } from "@/components/VisibilityTag";
import { messages } from "@/i18n";
import { parseIdOrSlug, parseUsername } from "@/schema/params";
import { getPublicApiListing } from "@/services/api-listings";
import { getPayerState } from "@/services/payer";
import { getPublicProfile } from "@/services/profile";
import { buildApiListingMetadata, notFoundMetadata } from "@/services/seo";
import type { ProfileChildPageProps } from "@/types";
import { formatDate } from "@/utils/formatDate";

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

  const listing = await getPublicApiListing(
    result.ownerId,
    ref,
    result.profile.isOwner,
  );

  return listing ? { profile: result.profile, listing } : null;
};

export async function generateMetadata({
  params,
}: ProfileChildPageProps): Promise<Metadata> {
  const resolved = await resolve(await params);

  return resolved
    ? buildApiListingMetadata(resolved.profile, resolved.listing)
    : notFoundMetadata();
}

export default async function ApiListingPage({
  params,
}: ProfileChildPageProps) {
  const resolved = await resolve(await params);

  if (!resolved) {
    notFound();
  }

  const { listing, profile } = resolved;
  const payerState = await getPayerState(listing.network);

  return (
    <article className="flex flex-col gap-10">
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
                <UiLink
                  className="text-sm"
                  external
                  href={listing.docsUrl}
                  icon={<ExternalLink aria-hidden="true" className="h-4 w-4" />}
                >
                  {messages.common.viewDocs}
                </UiLink>
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

      {listing.endpoints.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold text-ink-strong text-lg tracking-tight">
              {messages.api.endpointsHeading}
            </h2>
            <p className="text-ink-muted text-sm">
              {messages.api.endpointsLead}
            </p>
          </div>

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
        </section>
      )}

      {!profile.isOwner && (
        <PayWithFourMica network={listing.network} state={payerState} />
      )}

      <ApiIntegration isOwner={profile.isOwner} listing={listing} />

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
