import { links } from "@/services/links";

/**
 * Every absolute profile URL in the app comes from here, which comes from
 * @4mica/url. The dashboard's "copy public profile" uses the same builder, so
 * the two can never disagree about the handle format.
 */
export const profileUrl = (username: string): string => links.profile(username);

/** Relative paths, for <Link href>. */
export const profilePath = (username: string): string => `/${username}`;

export const agentPath = (username: string, ref: string): string =>
  `/${username}/agents/${ref}`;

export const apiListingPath = (username: string, ref: string): string =>
  `/${username}/api/${ref}`;
