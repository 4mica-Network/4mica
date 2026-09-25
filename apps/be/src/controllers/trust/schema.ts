import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  positiveInt,
} from "@controllers/schema-primitives";
import * as v from "valibot";

const nullableText = (max: number) =>
  v.optional(
    v.pipe(
      v.nullable(v.string()),
      v.transform((value) => (value ?? "").trim()),
      v.maxLength(max, `must be ${max} characters or shorter`),
      v.transform((value) => (value === "" ? null : value)),
    ),
  );

const nullableUrl = () =>
  v.optional(
    v.pipe(
      v.nullable(v.string()),
      v.transform((value) => (value ?? "").trim()),
      v.maxLength(2048, "must be 2048 characters or shorter"),
      v.transform((value) => (value === "" ? null : value)),
      v.check(
        (value) => value === null || /^https?:\/\/\S+$/.test(value),
        "must be an http:// or https:// URL",
      ),
    ),
  );

const nullableEmail = () =>
  v.optional(
    v.pipe(
      v.nullable(v.string()),
      v.transform((value) => (value ?? "").trim()),
      v.maxLength(320, "must be 320 characters or shorter"),
      v.transform((value) => (value === "" ? null : value)),
      v.check(
        (value) => value === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
        "must be an email address",
      ),
    ),
  );

export const UpsertPolicySchema = v.object({
  policyEnabled: v.optional(v.boolean()),
  faqEnabled: v.optional(v.boolean()),
  refundPolicy: nullableText(2000),
  uptimeTarget: nullableText(120),
  supportResponse: nullableText(120),
  supportEmail: nullableEmail(),
  rateLimit: nullableText(120),
  dataRetention: nullableText(2000),
  testEndpoint: nullableUrl(),
  termsUrl: nullableUrl(),
  privacyUrl: nullableUrl(),
  statusUrl: nullableUrl(),
});

export const ReplyToReviewSchema = v.object({
  reply: v.pipe(
    v.nullable(v.string()),
    v.transform((value) => (value ?? "").trim()),
    v.maxLength(2000, "must be 2000 characters or shorter"),
    v.transform((value) => (value === "" ? null : value)),
  ),
});

export const UpdateReportSchema = v.object({
  status: v.picklist(["ACKNOWLEDGED", "RESOLVED"]),
  resolutionNote: nullableText(2000),
});

export const ListReviewsQuerySchema = v.object({
  page: positiveInt(1, Number.MAX_SAFE_INTEGER),
  limit: positiveInt(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
});

export const ListReportsQuerySchema = v.object({
  page: positiveInt(1, Number.MAX_SAFE_INTEGER),
  limit: positiveInt(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  status: v.optional(
    v.picklist(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"]),
  ),
});

export type UpsertPolicyInput = v.InferOutput<typeof UpsertPolicySchema>;
export type ListReviewsQuery = v.InferOutput<typeof ListReviewsQuerySchema>;
export type ListReportsQuery = v.InferOutput<typeof ListReportsQuerySchema>;

export const FaqItemSchema = v.object({
  question: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "cannot be empty"),
    v.maxLength(280, "must be 280 characters or shorter"),
  ),
  answer: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "cannot be empty"),
    v.maxLength(2000, "must be 2000 characters or shorter"),
  ),
});

export const ReorderFaqsSchema = v.object({
  ids: v.pipe(
    v.array(v.string()),
    v.minLength(1, "select at least one"),
    v.maxLength(100),
    v.transform((ids) => [...new Set(ids)]),
  ),
});

export type FaqItemInput = v.InferOutput<typeof FaqItemSchema>;
