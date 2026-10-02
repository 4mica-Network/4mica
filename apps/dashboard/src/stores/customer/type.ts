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
  SUSPENDED: "SUSPENDED",
} as const;

export type CustomerStatus =
  (typeof CUSTOMER_STATUS)[keyof typeof CUSTOMER_STATUS];

export const CUSTOMER_QUOTA_UNIT = {
  REQUESTS: "REQUESTS",
  AMOUNT: "AMOUNT",
} as const;

export type CustomerQuotaUnit =
  (typeof CUSTOMER_QUOTA_UNIT)[keyof typeof CUSTOMER_QUOTA_UNIT];

export const CUSTOMER_QUOTA_PERIOD = {
  DAY: "DAY",
  WEEK: "WEEK",
  MONTH: "MONTH",
  TOTAL: "TOTAL",
} as const;

export type CustomerQuotaPeriod =
  (typeof CUSTOMER_QUOTA_PERIOD)[keyof typeof CUSTOMER_QUOTA_PERIOD];

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
  blockedAt: string | null;
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
  statusReason: string | null;
  suspendedUntil: string | null;
  description: string | null;
  notes: string | null;
  dailyLimit: string | null;
  monthlyLimit: string | null;
  limitCurrency: string;
  freeQuotaUnit: CustomerQuotaUnit | null;
  freeQuota: string | null;
  freeQuotaPeriod: CustomerQuotaPeriod | null;
  quotaResetAt: string | null;
  quotaUsed: string | null;
  quotaRemaining: string | null;
  discountPercent: string | null;
  discountFixed: string | null;
  minPaymentAmount: string | null;
  approvalThreshold: string | null;
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

export const CUSTOMER_CREDIT_KIND = {
  PROMOTIONAL: "PROMOTIONAL",
  PREPAID: "PREPAID",
  ADJUSTMENT: "ADJUSTMENT",
} as const;

export type CustomerCreditKind =
  (typeof CUSTOMER_CREDIT_KIND)[keyof typeof CUSTOMER_CREDIT_KIND];

export interface CustomerCreditBalance {
  total: string;
  promotional: string;
  prepaid: string;
}

export interface CustomerCreditEntry {
  id: string;
  kind: CustomerCreditKind;
  amount: string;
  reason: string | null;
  createdAt: string;
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
  credit: CustomerCreditBalance | null;
  creditEntries: CustomerCreditEntry[];
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
