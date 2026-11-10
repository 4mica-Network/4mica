import {
  DEFAULT_PAGE_SIZE,
  MAX_BATCH_DELETE,
  MAX_OFFSET,
  MAX_PAGE_SIZE,
  positiveInt,
  singleLine,
} from "@controllers/schema-primitives";
import * as v from "valibot";

export { MAX_OFFSET };

export const SUPPORT_CATEGORIES = [
  "ACCOUNT",
  "BILLING",
  "PAYMENTS",
  "WALLETS",
  "AGENTS",
  "API_LISTINGS",
  "INTEGRATION",
  "COMPLIANCE",
  "BUG",
  "FEATURE_REQUEST",
  "OTHER",
] as const;

export const SUPPORT_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export const SUPPORT_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "RESOLVED",
  "CLOSED",
] as const;

export const SUBJECT_MAX_LENGTH = 160;
export const BODY_MAX_LENGTH = 5000;
export const REFERENCE_MAX_LENGTH = 255;

export const SupportCategorySchema = v.picklist(SUPPORT_CATEGORIES);
export const SupportPrioritySchema = v.picklist(SUPPORT_PRIORITIES);
export const SupportStatusSchema = v.picklist(SUPPORT_STATUSES);

const subject = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "is required"),
  v.maxLength(SUBJECT_MAX_LENGTH),
  singleLine,
);

const body = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "is required"),
  v.maxLength(BODY_MAX_LENGTH),
);

const reference = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(REFERENCE_MAX_LENGTH),
  singleLine,
);

export const CreateSupportRequestSchema = v.object({
  subject,
  category: SupportCategorySchema,
  priority: v.optional(SupportPrioritySchema, "NORMAL"),
  description: body,
  reference: v.optional(v.nullable(reference)),
});

export const UpdateSupportRequestSchema = v.partial(
  v.object({
    subject,
    category: SupportCategorySchema,
    priority: SupportPrioritySchema,
    reference: v.nullable(reference),
    status: v.picklist(["OPEN", "CLOSED"]),
  }),
);

export const CreateSupportMessageSchema = v.object({ body });

export const BatchDeleteSupportRequestsSchema = v.object({
  ids: v.pipe(
    v.array(v.pipe(v.string(), v.uuid("must be a request id"))),
    v.minLength(1, "select at least one request"),
    v.maxLength(MAX_BATCH_DELETE),
    v.transform((ids) => [...new Set(ids)]),
  ),
});

export const ListSupportRequestsQuerySchema = v.object({
  page: positiveInt(1, Number.MAX_SAFE_INTEGER),
  limit: positiveInt(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
  status: v.optional(SupportStatusSchema),
  category: v.optional(SupportCategorySchema),
  sort: v.optional(
    v.picklist([
      "lastActivityAt",
      "-lastActivityAt",
      "createdAt",
      "-createdAt",
    ]),
    "-lastActivityAt",
  ),
});

export type CreateSupportRequestInput = v.InferOutput<
  typeof CreateSupportRequestSchema
>;
export type UpdateSupportRequestInput = v.InferOutput<
  typeof UpdateSupportRequestSchema
>;
export type ListSupportRequestsQuery = v.InferOutput<
  typeof ListSupportRequestsQuerySchema
>;
