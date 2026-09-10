import * as v from "valibot";

const token = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "token is required"),
  v.maxLength(512),
);

/** `GET /unsubscribe?token=…` — the confirm redirect. */
export const UnsubscribeQuerySchema = v.object({ token });

/**
 * `POST /unsubscribe` — the mutating half.
 *
 * The token is accepted from the query string as well as the body: RFC 8058
 * one-click clients POST to the advertised URL with a body of only
 * `List-Unsubscribe=One-Click`, so the query string is the only place the token
 * can travel for that flow.
 */
export const UnsubscribeBodySchema = v.object({
  token: v.optional(token),
});

export type UnsubscribeQuery = v.InferOutput<typeof UnsubscribeQuerySchema>;
export type UnsubscribeBody = v.InferOutput<typeof UnsubscribeBodySchema>;
