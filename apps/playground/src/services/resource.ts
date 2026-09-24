import "server-only";

import type { PublicAgent } from "@/schema/agent";
import type { PublicApiListing } from "@/schema/api-listing";
import { parseIdOrSlug, parseUsername } from "@/schema/params";
import type { PublicProfile } from "@/schema/profile";
import { getPublicAgent } from "./agents";
import { getPublicApiListing } from "./api-listings";
import { getPublicProfile } from "./profile";

export interface ResourceParams {
  username: string;
  id: string;
}

export interface ResolvedApiListing {
  profile: PublicProfile;
  listing: PublicApiListing;
}

export interface ResolvedAgent {
  profile: PublicProfile;
  agent: PublicAgent;
}

const resolveProfile = async (raw: ResourceParams) => {
  const username = parseUsername(raw.username);
  const ref = parseIdOrSlug(raw.id);

  if (!username || !ref) {
    return null;
  }

  const result = await getPublicProfile(username);

  return result ? { result, ref } : null;
};

export const resolveApiListing = async (
  raw: ResourceParams,
): Promise<ResolvedApiListing | null> => {
  const resolved = await resolveProfile(raw);

  if (!resolved) {
    return null;
  }

  const listing = await getPublicApiListing(
    resolved.result.ownerId,
    resolved.ref,
    resolved.result.profile.isOwner,
  );

  return listing ? { profile: resolved.result.profile, listing } : null;
};

export const resolveAgent = async (
  raw: ResourceParams,
): Promise<ResolvedAgent | null> => {
  const resolved = await resolveProfile(raw);

  if (!resolved) {
    return null;
  }

  const agent = await getPublicAgent(
    resolved.result.ownerId,
    resolved.ref,
    resolved.result.profile.isOwner,
  );

  return agent ? { profile: resolved.result.profile, agent } : null;
};
