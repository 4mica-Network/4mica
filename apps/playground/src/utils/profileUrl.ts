/**
 * Relative paths, for <Link href>. Absolute profile URLs come from
 * `links.profile` in @4mica/url, which the dashboard shares — the two can never
 * disagree about the handle format.
 */
export const profilePath = (username: string): string => `/${username}`;

export const agentPath = (username: string, ref: string): string =>
  `/${username}/agents/${ref}`;

export const apiListingPath = (username: string, ref: string): string =>
  `/${username}/api/${ref}`;
