import {
  address,
  PaymentNetworkSchema,
  positiveDecimalAmount,
  singleLine,
} from "@controllers/schema-primitives";
import * as v from "valibot";
import { GOVERNED_ACTIONS } from "./governance";

export const APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;
export const APPROVAL_KINDS = [
  "PAYMENT",
  "SELLER_PAYMENT",
  "GOVERNANCE",
] as const;
export const APPROVAL_VOTES = ["APPROVE", "REJECT"] as const;
export const APPROVAL_PAGE_MAX = 100;
export const APPROVAL_PAGE_DEFAULT = 50;
export const SELLER_PAYMENT_ACTION = "seller_payment";
export const DEFAULT_APPROVAL_TTL_HOURS = 72;
export const MAX_APPROVALS_REQUIRED = 5;
export const MAX_FINANCE_RECIPIENTS = 50;

export const ListApprovalsQuerySchema = v.object({
  status: v.optional(v.picklist(APPROVAL_STATUSES)),
  kind: v.optional(v.picklist(APPROVAL_KINDS)),
  cursor: v.optional(v.pipe(v.string(), v.uuid())),
  limit: v.optional(
    v.pipe(
      v.union([v.number(), v.string()]),
      v.transform(Number),
      v.integer(),
      v.minValue(1),
      v.maxValue(APPROVAL_PAGE_MAX),
    ),
    APPROVAL_PAGE_DEFAULT,
  ),
});

const optionalText = (max: number) =>
  v.optional(
    v.nullable(
      v.pipe(
        v.string(),
        v.trim(),
        v.maxLength(max),
        singleLine,
        v.transform((value) => value || null),
      ),
    ),
    null,
  );

export const DecideApprovalSchema = v.object({
  vote: v.picklist(APPROVAL_VOTES),
  comment: optionalText(500),
});

export const CreateSellerApprovalSchema = v.object({
  customerId: v.optional(v.nullable(v.pipe(v.string(), v.uuid())), null),
  payerAddress: address,
  network: PaymentNetworkSchema,
  assetAddress: v.optional(v.nullable(address), null),
  amount: positiveDecimalAmount,
  resource: optionalText(200),
  reason: optionalText(200),
});

const uniqueArray = <T>(values: T[]) => [...new Set(values)];

export const UpdateGovernanceSchema = v.object({
  approvalsRequired: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.maxValue(MAX_APPROVALS_REQUIRED),
    ),
  ),
  governedActions: v.optional(
    v.pipe(v.array(v.picklist(GOVERNED_ACTIONS)), v.transform(uniqueArray)),
  ),
  approvalTtlHours: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(720)),
  ),
  financeRecipientIds: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.uuid())),
      v.maxLength(MAX_FINANCE_RECIPIENTS),
      v.transform((values) =>
        uniqueArray(values.map((id) => id.toLowerCase())),
      ),
    ),
  ),
  auditRetentionDays: v.optional(
    v.nullable(
      v.pipe(v.number(), v.integer(), v.minValue(30), v.maxValue(3650)),
    ),
  ),
});

export type ListApprovalsQuery = v.InferOutput<typeof ListApprovalsQuerySchema>;
export type CreateSellerApprovalInput = v.InferOutput<
  typeof CreateSellerApprovalSchema
>;
export type UpdateGovernanceInput = v.InferOutput<
  typeof UpdateGovernanceSchema
>;
