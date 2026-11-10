export type { BatchDeleteResult } from "@stores/shared/type";

export const SUPPORT_STATUS = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  WAITING_ON_CUSTOMER: "WAITING_ON_CUSTOMER",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
} as const;

export type SupportStatus =
  (typeof SUPPORT_STATUS)[keyof typeof SUPPORT_STATUS];

export type SupportCategory =
  | "ACCOUNT"
  | "BILLING"
  | "PAYMENTS"
  | "WALLETS"
  | "AGENTS"
  | "API_LISTINGS"
  | "INTEGRATION"
  | "COMPLIANCE"
  | "BUG"
  | "FEATURE_REQUEST"
  | "OTHER";

export type SupportPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type SupportAuthor = "CUSTOMER" | "SUPPORT";

export interface SupportRequest {
  id: string;
  number: number;
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportStatus;
  description: string;
  reference: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  author: SupportAuthor;
  body: string;
  createdAt: string;
}

export interface SupportRequestDetail extends SupportRequest {
  messages: SupportMessage[];
}

export interface SupportRequestListResponse {
  items: SupportRequest[];
  total: number;
  page: number;
  limit: number;
}

export interface SupportRequestInput {
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  description: string;
  reference: string | null;
}

export type SupportRequestPatch = Partial<
  Omit<SupportRequestInput, "description"> & { status: "OPEN" | "CLOSED" }
>;

export interface SupportFilters {
  q: string;
  status: SupportStatus | "";
  category: SupportCategory | "";
}

export type SupportState = {
  items: SupportRequest[];
  total: number;
  page: number;
  limit: number;
  filters: SupportFilters;
  selectedIds: string[];
  isLoading: boolean;
  hasLoaded: boolean;
  current: SupportRequestDetail | null;
  isLoadingCurrent: boolean;
  currentError: string | null;
  pending: Record<string, boolean>;
  error: string | null;
  validationIssues: Record<string, string>;
};
