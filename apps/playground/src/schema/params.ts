import * as v from "valibot";

/**
 * Route-param validation. This is the only thing standing between a raw URL
 * segment and a Prisma `where` clause, so the bounds and the character class
 * are copied verbatim from apps/be/src/controllers/me/schema.ts — the two must
 * never diverge, or a handle the API accepts becomes unreachable here.
 */

const USERNAME_PATTERN = /^[a-z0-9_-]+$/;

/**
 * Handles are addressed bare (`/mo`). A leading `@` is accepted and stripped
 * for compatibility with the dashboard's older `/@mo` links; middleware.ts
 * redirects those to the canonical form before a page ever sees them.
 */
const UsernameParamSchema = v.pipe(
  v.string(),
  v.trim(),
  v.transform((value) => value.replace(/^@/, "").toLowerCase()),
  v.minLength(3, "username must be at least 3 characters"),
  v.maxLength(64, "username must be at most 64 characters"),
  v.regex(
    USERNAME_PATTERN,
    "username may only contain lowercase letters, numbers, - and _",
  ),
);

/** A uuid(7) primary key or a per-owner slug. Same character class. */
const IdOrSlugParamSchema = v.pipe(
  v.string(),
  v.trim(),
  v.transform((value) => value.toLowerCase()),
  v.minLength(1),
  v.maxLength(64),
  v.regex(USERNAME_PATTERN, "identifier contains unsupported characters"),
);

/**
 * Parse without throwing, so pages read `if (!x) notFound()` rather than
 * wrapping every await in a try/catch.
 */
export const safeParam = <TSchema extends v.GenericSchema>(
  schema: TSchema,
  value: unknown,
): v.InferOutput<TSchema> | null => {
  const result = v.safeParse(schema, value);
  return result.success ? result.output : null;
};

export const parseUsername = (value: unknown): string | null =>
  safeParam(UsernameParamSchema, value);

export const parseIdOrSlug = (value: unknown): string | null =>
  safeParam(IdOrSlugParamSchema, value);

/** Visibility values a public reader is allowed to resolve at a direct URL. */
export const VisibilitySchema = v.picklist([
  "PRIVATE",
  "UNLISTED",
  "PUBLIC",
] as const);

export type Visibility = v.InferOutput<typeof VisibilitySchema>;
