import type { Payment } from "@stores/payment/type";
import type { PaymentNetwork } from "@stores/wallet/type";

export type { Payment, PaymentStatus } from "@stores/payment/type";
export type { BatchDeleteResult, PaymentNetwork } from "@stores/wallet/type";

export const CUSTOMER_TYPE = {
  HUMAN: "HUMAN",
  ORGANIZATION: "ORGANIZATION",
  AGENT: "AGENT",
  WALLET: "WALLET",
} as const;

export type CustomerType = (typeof CUSTOMER_TYPE)[keyof typeof CUSTOMER_TYPE];

export const CUSTOMER_STATUS = {
  ACTIVE: "ACTIVE",
  BLOCKED: "BLOCKED",
} as const;

export type CustomerStatus =
  (typeof CUSTOMER_STATUS)[keyof typeof CUSTOMER_STATUS];

export const CUSTOMER_IDENTITY_TYPE = {
  WALLET: "WALLET",
  EMAIL: "EMAIL",
  EXTERNAL: "EXTERNAL",
} as const;

export type CustomerIdentityType =
  (typeof CUSTOMER_IDENTITY_TYPE)[keyof typeof CUSTOMER_IDENTITY_TYPE];

export const CUSTOMER_IDENTITY_SOURCE = {
  MANUAL: "MANUAL",
  API: "API",
  VERIFIED: "VERIFIED",
  DISCOVERED: "DISCOVERED",
} as const;

export type CustomerIdentitySource =
  (typeof CUSTOMER_IDENTITY_SOURCE)[keyof typeof CUSTOMER_IDENTITY_SOURCE];

export interface CustomerIdentity {
  id: string;
  type: CustomerIdentityType;
  network: PaymentNetwork | null;
  address: string | null;
  value: string | null;
  source: CustomerIdentitySource;
  verifiedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Volume is grouped by network and asset, never summed into one number, so a
 * customer paying in two tokens has two entries rather than a nonsense total.
 */
export interface SpendBucket {
  network: string;
  assetAddress: string | null;
  amount: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  type: CustomerType;
  status: CustomerStatus;
  description: string | null;
  notes: string | null;
  dailyLimit: string | null;
  monthlyLimit: string | null;
  limitCurrency: string;
  identities: CustomerIdentity[];
  totalSpend: SpendBucket[];
  recentSpend: SpendBucket[];
  txnCount: number;
  settledCount: number;
  failedCount: number;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListResponse {
  items: Customer[];
  total: number;
  page: number;
  limit: number;
}

export interface CustomerOverview {
  totalSpend: SpendBucket[];
  recentSpend: SpendBucket[];
  txnCount: number;
  settledCount: number;
  failedCount: number;
  lastActiveAt: string | null;
  firstSeenAt: string | null;
}

export interface CustomerActivityResponse {
  items: Payment[];
  total: number;
  page: number;
  limit: number;
}

export type CustomerSort =
  | "totalSpend"
  | "-totalSpend"
  | "recentSpend"
  | "-recentSpend"
  | "txnCount"
  | "-txnCount"
  | "lastActiveAt"
  | "-lastActiveAt"
  | "name"
  | "-name"
  | "createdAt"
  | "-createdAt";

export interface CustomerFilters {
  q: string;
  type: CustomerType | "";
  status: CustomerStatus | "";
  network: PaymentNetwork | "";
  sort: CustomerSort;
}

export interface CustomerDetail {
  customer: Customer | null;
  overview: CustomerOverview | null;
  activity: {
    items: Payment[];
    total: number;
    page: number;
    limit: number;
  };
  isLoading: boolean;
  hasLoaded: boolean;
}

export type CustomerState = {
  items: Customer[];
  total: number;
  page: number;
  limit: number;
  filters: CustomerFilters;
  selectedIds: string[];
  isLoading: boolean;
  hasLoaded: boolean;
  pending: Record<string, boolean>;
  error: string | null;
  validationIssues: Record<string, string>;
  detail: CustomerDetail;
};
