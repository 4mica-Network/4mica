import "server-only";

import { unstable_cache } from "next/cache";

export const PUBLIC_DATA_TTL_SECONDS = 60;

export const ownerTag = (ownerId: string): string => `owner:${ownerId}`;

export const resourceTag = (kind: string, id: string): string =>
  `resource:${kind}:${id}`;

export const cachedPublic = <Args extends (string | number)[], Result>(
  key: string,
  load: (...args: Args) => Promise<Result>,
  tags: (...args: Args) => string[],
) => {
  return (...args: Args): Promise<Result> =>
    unstable_cache(load, [key], {
      revalidate: PUBLIC_DATA_TTL_SECONDS,
      tags: tags(...args),
    })(...args);
};
