import { HttpMethod } from "@4mica/http";
import type { ResourceKind } from "@stores/trust/actions";
import type {
  PolicyInput,
  Report,
  ReportStatus,
  ResourcePolicy,
  Review,
  TrustSummary,
} from "@stores/trust/type";
import { httpClient } from "./client";

const base = (kind: ResourceKind, id: string) =>
  `${kind === "listing" ? "/me/api-listings" : "/me/agents"}/${encodeURIComponent(id)}`;

export interface ListResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export const getPolicy = (kind: ResourceKind, id: string) =>
  httpClient.request<{ policy: ResourcePolicy | null }>({
    url: `${base(kind, id)}/policy`,
    method: HttpMethod.GET,
  });

export const savePolicy = (kind: ResourceKind, id: string, data: PolicyInput) =>
  httpClient.request<{ policy: ResourcePolicy }, PolicyInput>({
    url: `${base(kind, id)}/policy`,
    method: HttpMethod.PUT,
    data,
  });

export const getTrustSummary = (kind: ResourceKind, id: string) =>
  httpClient.request<TrustSummary>({
    url: `${base(kind, id)}/trust`,
    method: HttpMethod.GET,
  });

export const getReviews = (kind: ResourceKind, id: string) =>
  httpClient.request<ListResponse<Review>>({
    url: `${base(kind, id)}/reviews`,
    method: HttpMethod.GET,
  });

export const replyToReview = (
  kind: ResourceKind,
  id: string,
  reviewId: string,
  reply: string | null,
) =>
  httpClient.request<{ review: Review }, { reply: string | null }>({
    url: `${base(kind, id)}/reviews/${encodeURIComponent(reviewId)}/reply`,
    method: HttpMethod.POST,
    data: { reply },
  });

export const getReports = (kind: ResourceKind, id: string) =>
  httpClient.request<ListResponse<Report>>({
    url: `${base(kind, id)}/reports`,
    method: HttpMethod.GET,
  });

export const updateReport = (
  kind: ResourceKind,
  id: string,
  reportId: string,
  status: Extract<ReportStatus, "ACKNOWLEDGED" | "RESOLVED">,
  resolutionNote?: string | null,
) =>
  httpClient.request<
    { report: Report },
    { status: string; resolutionNote?: string | null }
  >({
    url: `${base(kind, id)}/reports/${encodeURIComponent(reportId)}`,
    method: HttpMethod.PATCH,
    data: { status, resolutionNote },
  });
