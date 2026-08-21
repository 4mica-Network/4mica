export const WEBHOOK_STATUS = {
  ENABLED: "ENABLED",
  DISABLED: "DISABLED",
} as const;

export type WebhookStatus =
  (typeof WEBHOOK_STATUS)[keyof typeof WEBHOOK_STATUS];

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Webhook {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  status: WebhookStatus;
  secretPrefix: string;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: number | null;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEvent {
  slug: string;
  group: string;
  description: string;
}

/** Shown once after create or rotate, then discarded from the store. */
export interface RevealedSecret {
  kind: "apiKey" | "webhookSecret";
  id: string;
  plaintext: string;
}

export type DeveloperState = {
  apiKeys: ApiKey[];
  webhooks: Webhook[];
  events: WebhookEvent[];
  revealed: RevealedSecret | null;
  isLoading: boolean;
  /**
   * Sticky once the first fetch lands. The integration checklist mounts in the
   * AppShell and fetches too, so by the time the developer page re-fetches on
   * mount the data is already on screen — this lets it skip the loading state
   * rather than blanking content it is about to redraw identically.
   */
  hasLoaded: boolean;
  pending: Record<string, boolean>;
  error: string | null;
  validationIssues: Record<string, string>;
};
