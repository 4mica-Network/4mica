import * as v from "valibot";

const token = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "token is required"),
  v.maxLength(512),
);

export const UnsubscribeQuerySchema = v.object({ token });

export const UnsubscribeBodySchema = v.object({
  token: v.optional(token),
});

export type UnsubscribeQuery = v.InferOutput<typeof UnsubscribeQuerySchema>;
export type UnsubscribeBody = v.InferOutput<typeof UnsubscribeBodySchema>;
