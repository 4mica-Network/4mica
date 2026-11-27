import { apiKeyScopes } from "@controllers/developer/schema";
import { futureTimestamp, singleLine } from "@controllers/schema-primitives";
import * as v from "valibot";

const name = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(120),
  singleLine,
);

const description = v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(280)));

export const CreateServiceAccountSchema = v.object({
  name,
  description: v.optional(description),
});

export const UpdateServiceAccountSchema = v.partial(
  v.object({ name, description }),
);

export const CreateServiceAccountKeySchema = v.object({
  name,
  scopes: apiKeyScopes,
  expiresAt: v.optional(v.nullable(futureTimestamp)),
});

export const RotateServiceAccountKeySchema = v.object({
  expireOldInHours: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(168)),
    0,
  ),
});

export type CreateServiceAccountInput = v.InferOutput<
  typeof CreateServiceAccountSchema
>;
export type UpdateServiceAccountInput = v.InferOutput<
  typeof UpdateServiceAccountSchema
>;
export type CreateServiceAccountKeyInput = v.InferOutput<
  typeof CreateServiceAccountKeySchema
>;
