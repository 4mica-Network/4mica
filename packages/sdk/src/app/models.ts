export type ResourceKind = "listing" | "agent";

export type AppNetwork = "BASE" | "BASE_SEPOLIA" | "ETHEREUM_SEPOLIA";

export type AppVisibility = "PRIVATE" | "UNLISTED" | "PUBLIC";

export type AppAgentStatus = "PENDING" | "ACTIVE" | "SUSPENDED";

export type AppPaymentStatus = "PENDING" | "SETTLED" | "FAILED";

export interface AppListing {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  url: string | null;
  method: string;
  docsUrl: string | null;
  category: string | null;
  tags: string[];
  priceLabel: string | null;
  visibility: AppVisibility;
  publishedAt: string | null;
  walletId: string | null;
  network: AppNetwork | null;
  payToAddress: string | null;
  assetAddress: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
  x402Endpoint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppAgent {
  id: string;
  slug: string | null;
  name: string;
  headline: string | null;
  description: string | null;
  avatarUrl: string | null;
  docsUrl: string | null;
  status: AppAgentStatus;
  visibility: AppVisibility;
  network: AppNetwork;
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

export interface AppPolicy {
  id: string;
  policyEnabled: boolean;
  faqEnabled: boolean;
  refundPolicy: string | null;
  uptimeTarget: string | null;
  supportResponse: string | null;
  supportEmail: string | null;
  rateLimit: string | null;
  dataRetention: string | null;
  testEndpoint: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  statusUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppFaq {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceContext {
  kind: ResourceKind;
  listing: AppListing | null;
  agent: AppAgent | null;
  policy: AppPolicy | null;
  faqs: AppFaq[];
}

export interface ResolveCustomerInput {
  payerAddress: string;
  network: string;
  amount: string;
  couponCode?: string | null;
}

export type CustomerDeniedReason =
  | "customer_blocked"
  | "customer_suspended"
  | "identity_blocked"
  | "below_minimum"
  | "daily_limit_exceeded"
  | "monthly_limit_exceeded";

export type CouponSkippedReason =
  | "unknown"
  | "revoked"
  | "expired"
  | "exhausted";

export interface CustomerResolution {
  customerId: string | null;
  allowed: boolean;
  deniedReason: CustomerDeniedReason | null;
  needsApproval: boolean;
  gross: string;
  quotaApplied: string;
  couponApplied: string;
  discountApplied: string;
  creditApplied: string;
  payable: string;
  couponSkippedReason: CouponSkippedReason | null;
}

export interface ReportPaymentInput {
  reqId: string;
  payerAddress: string;
  recipientAddress: string;
  network: string;
  amount: string;
  assetAddress?: string | null;
  status?: AppPaymentStatus;
  failureReason?: string | null;
  listingSlug?: string | null;
  agentSlug?: string | null;
  resource?: string | null;
  description?: string | null;
  guaranteeClaims?: string | null;
  guaranteeSignature?: string | null;
  txHash?: string | null;
  settledAt?: string | null;
  couponCode?: string | null;
  creditApplied?: string | null;
}

export interface AppPayment {
  id: string;
  listingId: string | null;
  agentId: string | null;
  payerAddress: string;
  recipientAddress: string;
  network: AppNetwork;
  assetAddress: string | null;
  amount: string;
  status: AppPaymentStatus;
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
  direction: "sent" | "received";
}

export interface ReportedPayment {
  payment: AppPayment;
  created: boolean;
}

export interface AppIssue {
  path: string;
  message: string;
}
