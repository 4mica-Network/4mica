import type { PublicVisibility } from "@stores/apiListing/type";
import type { PaymentNetwork } from "@stores/wallet/type";

export type { PublicVisibility } from "@stores/apiListing/type";
export { PUBLIC_VISIBILITY } from "@stores/apiListing/type";
export type { BatchDeleteResult, PaymentNetwork } from "@stores/wallet/type";

export const AGENT_STATUS = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;

export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];

export const AGENT_STATUS_OPTIONS = [
  AGENT_STATUS.PENDING,
  AGENT_STATUS.ACTIVE,
] as const;

export interface Agent {
  id: string;
  slug: string | null;
  name: string;
  headline: string | null;
  description: string | null;
  avatarUrl: string | null;
  docsUrl: string | null;
  status: AgentStatus;
  visibility: PublicVisibility;
  network: PaymentNetwork;

  walletAddress: string | null;
  payerWalletId: string | null;
  creditLimit: string;

  walletId: string | null;
  payToAddress: string | null;
  assetAddress: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
  priceLabel: string | null;
  endpointUrl: string | null;
  x402Endpoint: string | null;

  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentListResponse {
  items: Agent[];
  total: number;
  page: number;
  limit: number;
}

export interface AgentFilters {
  q: string;
  status: AgentStatus | "";
  visibility: PublicVisibility | "";
  network: PaymentNetwork | "";
}

export type AgentState = {
  items: Agent[];
  total: number;
  page: number;
  limit: number;
  filters: AgentFilters;
  selectedIds: string[];
  isLoading: boolean;
  hasLoaded: boolean;
  pending: Record<string, boolean>;
  error: string | null;
  validationIssues: Record<string, string>;
};
