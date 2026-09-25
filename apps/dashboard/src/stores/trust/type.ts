export const REPORT_STATUS = {
  OPEN: "OPEN",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  RESOLVED: "RESOLVED",
  DISMISSED: "DISMISSED",
} as const;

export type ReportStatus = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];

export const REPORT_REASON = {
  SCAM: "SCAM",
  NOT_WORKING: "NOT_WORKING",
  MISLEADING_PRICING: "MISLEADING_PRICING",
  SPAM: "SPAM",
  OTHER: "OTHER",
} as const;

export type ReportReason = (typeof REPORT_REASON)[keyof typeof REPORT_REASON];

export interface ResourcePolicy {
  id: string;
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

export interface PolicyInput {
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
}

export interface ReviewAuthor {
  username: string | null;
  name: string;
  avatarUrl: string | null;
}

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  verifiedPurchase: boolean;
  ownerReply: string | null;
  ownerRepliedAt: string | null;
  hiddenAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: ReviewAuthor;
}

export interface Report {
  id: string;
  reason: ReportReason;
  detail: string | null;
  status: ReportStatus;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrustSummary {
  ratingCount: number;
  ratingAverage: number | null;
  verifiedCount: number;
  openReports: number;
  unansweredReviews: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
}

export interface TrustState {
  policy: ResourcePolicy | null;
  summary: TrustSummary | null;
  reviews: Review[];
  reports: Report[];
  pending: Record<string, boolean>;
  error: string | null;
  validationIssues: Record<string, string>;
}
