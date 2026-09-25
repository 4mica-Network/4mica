import {
  USERNAME_MAX_LENGTH,
  USERNAME_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "@4mica/url";
import * as v from "valibot";

const UsernameParamSchema = v.pipe(
  v.string(),
  v.trim(),
  v.transform((value) => value.replace(/^@/, "").toLowerCase()),
  v.minLength(USERNAME_MIN_LENGTH, "username must be at least 2 characters"),
  v.maxLength(USERNAME_MAX_LENGTH, "username must be at most 64 characters"),
  v.regex(USERNAME_PATTERN, USERNAME_MESSAGE),
);

const IdOrSlugParamSchema = v.pipe(
  v.string(),
  v.trim(),
  v.transform((value) => value.toLowerCase()),
  v.minLength(1),
  v.maxLength(64),
  v.regex(USERNAME_PATTERN, "identifier contains unsupported characters"),
);

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

export const VisibilitySchema = v.picklist([
  "PRIVATE",
  "UNLISTED",
  "PUBLIC",
] as const);

export type Visibility = v.InferOutput<typeof VisibilitySchema>;

export const PaymentNetworkSchema = v.picklist([
  "BASE",
  "BASE_SEPOLIA",
  "ETHEREUM_SEPOLIA",
] as const);

export type PaymentNetwork = v.InferOutput<typeof PaymentNetworkSchema>;

export const HttpMethodSchema = v.picklist([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const);

export type HttpMethod = v.InferOutput<typeof HttpMethodSchema>;
