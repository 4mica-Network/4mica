import type { PaymentNetwork } from "@4mica/rules";

export type { PaymentNetwork };

export const PUBLIC_VISIBILITY = {
  PRIVATE: "PRIVATE",
  UNLISTED: "UNLISTED",
  PUBLIC: "PUBLIC",
} as const;

export type PublicVisibility =
  (typeof PUBLIC_VISIBILITY)[keyof typeof PUBLIC_VISIBILITY];

export interface BatchDeleteResult {
  deleted: string[];
  notFound: string[];
}

export type ResourceKind = "listing" | "agent";

export interface ResourceRef {
  kind: ResourceKind;
  id: string;
}
