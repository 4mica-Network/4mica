import { apiKeyScopes, keyIpAllowlist } from "@controllers/developer/schema";
import { futureTimestamp, singleLine } from "@controllers/schema-primitives";
import * as v from "valibot";

const name = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(120),
  singleLine,
);

export const CreateResourceKeySchema = v.object({
  name,
  scopes: v.optional(apiKeyScopes),
  expiresAt: v.optional(v.nullable(futureTimestamp)),
  ipAllowlist: keyIpAllowlist,
});

export type CreateResourceKeyInput = v.InferOutput<
  typeof CreateResourceKeySchema
>;
