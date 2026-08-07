import { Tag, Link as UiLink } from "@4mica/ui";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileNav } from "@/components/ProfileNav";
import { Prose } from "@/components/Prose";
import { VisibilityTag } from "@/components/VisibilityTag";
import { messages, t } from "@/i18n";
import { parseIdOrSlug, parseUsername } from "@/schema/params";
import { getPublicApiListing } from "@/services/api-listings";
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

  return (
    <article className="flex flex-col gap-6">
      <ProfileNav
        displayName={profile.name || profile.username}
        username={profile.username}
      />

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-semibold text-2xl text-ink-strong">
            {listing.name}
          </h1>
          {listing.category && (
            <Tag size="sm" variant="neutral">
              {listing.category}
            </Tag>
          )}
          {profile.isOwner && <VisibilityTag visibility={listing.visibility} />}
        </div>
        {listing.summary && <p className="text-ink-muted">{listing.summary}</p>}
        {listing.publishedAt && (
          <p className="text-ink-subtle text-sm">
            {t(messages.api.published, {
              date: formatDate(listing.publishedAt),
            })}
          </p>
        )}
      </header>

      <dl className="flex flex-col gap-4 rounded-lg border border-overlay/10 px-5 py-4">
        {listing.baseUrl && (
          <div className="flex flex-col gap-1">
            <dt className="text-ink-subtle text-xs uppercase tracking-wide">
              {messages.api.baseUrl}
            </dt>
            <dd className="break-all font-mono text-ink-body text-sm">
              {listing.baseUrl}
            </dd>
          </div>
        )}
        {listing.priceLabel && (
          <div className="flex flex-col gap-1">
            <dt className="text-ink-subtle text-xs uppercase tracking-wide">
              {messages.api.pricing}
            </dt>
            <dd className="text-ink-body text-sm">{listing.priceLabel}</dd>
          </div>
        )}
        {listing.docsUrl && (
          <div className="flex flex-col gap-1">
            <dt className="sr-only">{messages.common.viewDocs}</dt>
            <dd>
              <UiLink
                external
                href={listing.docsUrl}
                icon={<ExternalLink aria-hidden="true" className="h-4 w-4" />}
                className="text-sm"
              >
                {messages.common.viewDocs}
              </UiLink>
            </dd>
          </div>
        )}
      </dl>

      {listing.description && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-ink-strong text-lg">
            {messages.api.aboutHeading}
          </h2>
          <Prose text={listing.description} />
        </section>
      )}

      {listing.tags.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-ink-strong text-lg">
            {messages.api.tagsHeading}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {listing.tags.map((tag) => (
              <Tag key={tag} size="sm">
                {tag}
              </Tag>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
