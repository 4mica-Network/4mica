import type { ApiKey, ApiKeyScope } from "@stores/developer/type";
import type { LoadStatus } from "@stores/organization/type";

export interface ServiceAccount {
  id: string;
  name: string;
  description: string | null;
  suspendedAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  keyCount: number;
}

export interface NewServiceAccountKey {
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: string;
}

export type CreatedServiceAccountKey = ApiKey & { secret: string };

export interface ServiceAccountState {
  items: ServiceAccount[];
  status: LoadStatus;
  error: string | null;
  keys: Record<string, ApiKey[]>;
  keysStatus: Record<string, LoadStatus>;
  pending: Record<string, boolean>;
  issues: Record<string, string>;
  actionError: string | null;
}
