import {
  USERNAME_MAX_LENGTH,
  USERNAME_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "@4mica/url";
import * as v from "valibot";

/**
 * Route-param validation. This is the only thing standing between a raw URL
 * segment and a Prisma `where` clause. The bounds and the character class come
 * from @4mica/url, which is also what apps/be validates writes against — so a
 * handle the API accepts can never be unreachable here.
 */

/**
 * Handles are addressed bare (`/mo`). A leading `@` is accepted and stripped
 * for compatibility with the dashboard's older `/@mo` links; middleware.ts
 * redirects those to the canonical form before a page ever sees them.
 */
const UsernameParamSchema = v.pipe(
  v.string(),
  v.trim(),
  v.transform((value) => value.replace(/^@/, "").toLowerCase()),
  v.minLength(USERNAME_MIN_LENGTH, "username must be at least 2 characters"),
  v.maxLength(USERNAME_MAX_LENGTH, "username must be at most 64 characters"),
  v.regex(USERNAME_PATTERN, USERNAME_MESSAGE),
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

/**
 * Mirrors the `PaymentNetwork` enum in packages/db. Kept as a literal union
 * rather than imported from the generated client so the DTO layer stays free
 * of Prisma types — the same reason `VisibilitySchema` is written out above.
 */
export const PaymentNetworkSchema = v.picklist([
  "BASE",
  "BASE_SEPOLIA",
  "ETHEREUM_SEPOLIA",
] as const);

export type PaymentNetwork = v.InferOutput<typeof PaymentNetworkSchema>;

/** Mirrors the `HttpMethod` enum in packages/db. */
export const HttpMethodSchema = v.picklist([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const);

export type HttpMethod = v.InferOutput<typeof HttpMethodSchema>;
