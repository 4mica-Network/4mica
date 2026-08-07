import type { Metadata } from "next";
import type { PublicAgent } from "@/schema/agent";
import type { PublicApiListing } from "@/schema/api-listing";
import type { PublicProfile } from "@/schema/profile";

export const SITE_NAME = "4Mica";

const DESCRIPTION_LIMIT = 160;

/**
 * Sentence-aware clamp, ported from apps/web/seo/pages.ts so both sites
 * truncate identically.
 */
const clampDescription = (text: string): string => {
  if (text.length <= DESCRIPTION_LIMIT) return text;

  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  let kept = "";
  for (const sentence of sentences) {
    if ((kept + sentence).trim().length > DESCRIPTION_LIMIT) break;
    kept += sentence;
  }
  kept = kept.trim();

  if (kept.length >= 110) return kept;

  const cut = text.slice(0, DESCRIPTION_LIMIT - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
};

/**
 * Robots directives are driven by the user's own `allowSEOIndexing` setting.
 * An UNLISTED resource is always noindex regardless of the profile setting —
 * it is reachable by direct link only.
 */
const robotsFor = (indexable: boolean): Metadata["robots"] =>
  indexable
    ? { index: true, follow: true }
    : { index: false, follow: false, googleBot: { index: false } };

interface MetadataInput {
  title: string;
  description: string;
  path: string;
  username: string;
  indexable: boolean;
  keywords?: string[];
}

const build = ({
  title,
  description,
  path,
  username,
  indexable,
  keywords,
}: MetadataInput): Metadata => {
  const clamped = clampDescription(description);
  const ogImage = `/api/og/${username}`;

  return {
    title,
    description: clamped,
    keywords,
    robots: robotsFor(indexable),
    alternates: { canonical: path },
    openGraph: {
      title,
      description: clamped,
      url: path,
      siteName: SITE_NAME,
      images: [
        { url: ogImage, width: 1200, height: 630, alt: `${title} on 4Mica` },
      ],
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: clamped,
      images: [ogImage],
    },
  };
};

/** Metadata for a profile that does not exist or is not publicly visible. */
export const notFoundMetadata = (): Metadata => ({
  title: `Profile not found · ${SITE_NAME}`,
  description: "This 4Mica profile is not available.",
  robots: { index: false, follow: false },
});

export const buildProfileMetadata = (profile: PublicProfile): Metadata =>
  build({
    title: `${profile.name || profile.username} (@${profile.username}) · ${SITE_NAME}`,
    description:
      profile.bio ||
      profile.description ||
      `${profile.name || profile.username} on 4Mica — agents and APIs for the agentic economy.`,
    path: `/${profile.username}`,
    username: profile.username,
    // An owner-preview render must never be indexed, even if the flag is on.
    indexable: profile.allowSEOIndexing && profile.isPublished,
    keywords: [profile.username, "4Mica", "agent", "API", "agentic economy"],
  });

export const buildAgentMetadata = (
  profile: PublicProfile,
  agent: PublicAgent,
): Metadata =>
  build({
    title: `${agent.name} · @${profile.username} · ${SITE_NAME}`,
    description:
      agent.headline ||
      agent.description ||
      `${agent.name}, an agent operated by @${profile.username} on 4Mica.`,
    path: `/${profile.username}/agents/${agent.ref}`,
    username: profile.username,
    indexable:
      profile.allowSEOIndexing &&
      profile.isPublished &&
      agent.visibility === "PUBLIC",
  });

export const buildApiListingMetadata = (
  profile: PublicProfile,
  listing: PublicApiListing,
): Metadata =>
  build({
    title: `${listing.name} · @${profile.username} · ${SITE_NAME}`,
    description:
      listing.summary ||
      listing.description ||
      `${listing.name}, an API published by @${profile.username} on 4Mica.`,
    path: `/${profile.username}/api/${listing.ref}`,
    username: profile.username,
    indexable:
      profile.allowSEOIndexing &&
      profile.isPublished &&
      listing.visibility === "PUBLIC",
  });
