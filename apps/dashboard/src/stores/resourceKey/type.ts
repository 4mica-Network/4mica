import type { ApiKey } from "@stores/developer/type";
import type { ResourceRef } from "@stores/shared/type";

export interface RevealedResourceKey {
  id: string;
  plaintext: string;
}

export interface ResourceKeyState {
  resource: ResourceRef | null;
  items: ApiKey[];
  revealed: RevealedResourceKey | null;
  isLoading: boolean;
  hasLoaded: boolean;
  pending: Record<string, boolean>;
  error: string | null;
  validationIssues: Record<string, string>;
}
