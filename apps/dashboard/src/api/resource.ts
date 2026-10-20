import type { ResourceKind } from "@stores/shared/type";

export const resourcePath = (kind: ResourceKind, id: string): string =>
  `${kind === "listing" ? "/me/api-listings" : "/me/agents"}/${encodeURIComponent(id)}`;
