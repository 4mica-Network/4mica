import {
  address,
  PaymentNetworkSchema,
  positiveDecimalAmount,
  singleLine,
} from "@controllers/schema-primitives";
import * as v from "valibot";

export const SpendingPolicyScopeSchema = v.picklist([
  "ORGANIZATION",
  "PROJECT",
  "AGENT",
  "API_KEY",
]);

export const SpendingPolicyModeSchema = v.picklist(["ENFORCE", "MONITOR"]);

const uuid = v.pipe(v.string(), v.trim(), v.uuid("must be a UUID"));

const name = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "a name is required"),
  v.maxLength(120),
  singleLine,
);

const limit = v.optional(v.nullable(positiveDecimalAmount));

const fields = {
  name,
  mode: v.optional(SpendingPolicyModeSchema),
  network: v.optional(v.nullable(PaymentNetworkSchema)),
  assetAddress: v.optional(v.nullable(address)),
  perPaymentLimit: limit,
  dailyLimit: limit,
  monthlyLimit: limit,
  approvalThreshold: limit,
  approvalsRequired: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)),
  ),
  allowedRecipients: v.optional(
    v.pipe(
      v.array(address),
      v.maxLength(100),
      v.transform((values) => [...new Set(values)]),
    ),
  ),
  alertThresholds: v.optional(
    v.pipe(
      v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
      v.maxLength(5),
      v.transform((values) => [...new Set(values)].sort((a, b) => a - b)),
    ),
  ),
  enabled: v.optional(v.boolean()),
};

export const CreateSpendingPolicySchema = v.object({
  ...fields,
  scope: SpendingPolicyScopeSchema,
  projectId: v.optional(v.nullable(uuid)),
  agentId: v.optional(v.nullable(uuid)),
  apiKeyId: v.optional(v.nullable(uuid)),
});

export type CreateSpendingPolicyInput = v.InferOutput<
  typeof CreateSpendingPolicySchema
>;

export const UpdateSpendingPolicySchema = v.pipe(
  v.object({ ...fields, name: v.optional(name) }),
  v.check(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "nothing to update",
  ),
);

export type UpdateSpendingPolicyInput = v.InferOutput<
  typeof UpdateSpendingPolicySchema
>;

export const ListSpendingPoliciesQuerySchema = v.object({
  scope: v.optional(SpendingPolicyScopeSchema),
  projectId: v.optional(uuid),
  mode: v.optional(SpendingPolicyModeSchema),
});

export interface PolicyShape {
  network: string | null;
  assetAddress: string | null;
  perPaymentLimit: string | null;
  dailyLimit: string | null;
  monthlyLimit: string | null;
  approvalThreshold: string | null;
}

export const shapeIssues = (shape: PolicyShape) => {
  const issues: { path: string; message: string }[] = [];
  if (shape.network === null) {
    if (shape.assetAddress !== null) {
      issues.push({ path: "assetAddress", message: "requires a network" });
    }
    for (const field of [
      "perPaymentLimit",
      "dailyLimit",
      "monthlyLimit",
      "approvalThreshold",
    ] as const) {
      if (shape[field] !== null) {
        issues.push({
          path: field,
          message: "requires a network and asset, since amounts are per asset",
        });
      }
    }
  }
  return issues;
};
