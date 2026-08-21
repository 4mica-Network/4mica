export type { PublicAgent } from "@/schema/agent";
export type { PublicApiListing } from "@/schema/api-listing";
export type { Visibility } from "@/schema/params";
export type { PublicProfile } from "@/schema/profile";

export interface SessionIdentity {
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

/**
 * Next 16 passes route params as a Promise — every page and layout below
 * awaits them.
 */
export interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

export interface ProfileChildPageProps {
  params: Promise<{ username: string; id: string }>;
}
