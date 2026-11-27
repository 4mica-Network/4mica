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

export type CliSessionKind = "DEVICE" | "TOKEN";

export type CliScope =
  | "account:read"
  | "wallets:read"
  | "wallets:link"
  | "wallets:unlink";

export interface NewCliToken {
  name: string;
  scopes: CliScope[];
  expiresInDays: 30 | 90 | 365;
}

export interface CliSession {
  id: string;
  kind: CliSessionKind;
  name: string;
  prefix: string;
  last4: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string;
  createdAt: string;
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

export interface RevealedSecret {
  kind: "apiKey" | "webhookSecret" | "cliToken";
  id: string;
  plaintext: string;
}

export type RevealSecret = (secret: RevealedSecret) => void;

export type DeveloperState = {
  apiKeys: ApiKey[];
  webhooks: Webhook[];
  events: WebhookEvent[];
  cliSessions: CliSession[];
  cliSessionsLoading: boolean;
  cliSessionsLoaded: boolean;
  cliSessionsError: string | null;
  isLoading: boolean;
  hasLoaded: boolean;
  pending: Record<string, boolean>;
  error: string | null;
  validationIssues: Record<string, string>;
};
