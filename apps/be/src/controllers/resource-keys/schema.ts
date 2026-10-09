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
  expiresAt: v.optional(v.nullable(futureTimestamp)),
});

export type CreateResourceKeyInput = v.InferOutput<
  typeof CreateResourceKeySchema
>;
