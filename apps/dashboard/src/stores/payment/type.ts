import type { PaymentNetwork } from "@stores/wallet/type";

export type { PaymentNetwork } from "@stores/wallet/type";

export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  SETTLED: "SETTLED",
  FAILED: "FAILED",
} as const;

export type PaymentStatus =
  (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const PAYMENT_DIRECTION = {
  SENT: "sent",
  RECEIVED: "received",
} as const;

export type PaymentDirection =
  (typeof PAYMENT_DIRECTION)[keyof typeof PAYMENT_DIRECTION];

export interface Payment {
  id: string;
  listingId: string | null;
  agentId: string | null;
  payerAddress: string;
  recipientAddress: string;
  network: PaymentNetwork;
  assetAddress: string | null;
  amount: string;
  status: PaymentStatus;
  failureReason: string | null;
  reqId: string;
  txHash: string | null;
  resource: string | null;
  description: string | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
  listingSlug: string | null;
  listingName: string | null;
  agentSlug: string | null;
  agentName: string | null;
  direction: PaymentDirection;
}

export interface PaymentListResponse {
  items: Payment[];
  total: number;
  page: number;
  limit: number;
}

export interface PaymentVolume {
  assetAddress: string | null;
  network: string;
  amount: string;
}

export interface PaymentTotals {
  count: number;
  settledCount: number;
  pendingCount: number;
  failedCount: number;
  volume: PaymentVolume[];
}

export interface PaymentSummary {
  sent: PaymentTotals;
  received: PaymentTotals;
}

export interface MonthlyBucket {
  month: string;
  settledCount: number;
  failedCount: number;
  volume: PaymentVolume[];
}

export interface PaymentStats {
  months: string[];
  received: MonthlyBucket[];
  sent: MonthlyBucket[];
}

export interface PaymentFilters {
  q: string;
  direction: PaymentDirection | "";
  status: PaymentStatus | "";
  network: PaymentNetwork | "";
}

export type PaymentState = {
  items: Payment[];
  total: number;
  page: number;
  limit: number;
  filters: PaymentFilters;
  summary: PaymentSummary | null;
  stats: PaymentStats | null;
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
};
