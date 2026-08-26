import {
  USERNAME_MAX_LENGTH,
  USERNAME_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  usernameUnavailableReason,
} from "@4mica/url";
import * as v from "valibot";

const trimmed = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));

/**
 * The one handle rule, shared with the availability check and with the
 * playground's route params via @4mica/url.
 *
 * `toLowerCase` runs before the pattern so "Ada" normalises to "ada" instead of
 * 400ing — the playground lowercases when it resolves a profile, so a
 * mixed-case handle stored here would be unreachable at its own public URL.
 * The availability check keeps handles out of the marketing site's namespace —
 * public profiles are served bare off the same apex domain, so without it a
 * user could claim `pricing` and shadow that page — and out of the blacklist,
 * which bars role and brand names like `admin` or `stripe`.
 */
const usernameFormatPipe = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.minLength(USERNAME_MIN_LENGTH),
  v.maxLength(USERNAME_MAX_LENGTH),
  v.regex(USERNAME_PATTERN, USERNAME_MESSAGE),
);

const usernamePipe = v.pipe(
  usernameFormatPipe,
  v.check(
    (value) => usernameUnavailableReason(value) === null,
    "that username is not available",
  ),
);

/**
 * GET /me/username-available — the candidate handle, not an identity.
 *
 * Format only: a reserved or blacklisted handle is well-formed, so the handler
 * answers it as a 200 `{ available: false, reason }` rather than a 400. The
 * client is asking a question, and "no, and here's why" is a valid answer.
 */
export const CheckUsernameSchema = v.object({ username: usernameFormatPipe });

export type CheckUsernameInput = v.InferOutput<typeof CheckUsernameSchema>;

const nullableText = (max: number) =>
  v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(max)));

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const NOTIFICATION_PLACEMENTS = [
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
] as const;

export const BUSINESS_TYPES = [
  "SOLE_TRADER",
  "PARTNERSHIP",
  "LLC",
  "CORPORATION",
  "NON_PROFIT",
] as const;

/** PATCH /me/profile — public-facing identity. */
export const UpdateProfileSchema = v.partial(
  v.object({
    name: trimmed(120),
    username: v.nullable(usernamePipe),
    bio: nullableText(2000),
    description: nullableText(2000),
    avatarUrl: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(2048))),
    private: v.boolean(),
    hidden: v.boolean(),
    allowSEOIndexing: v.boolean(),
    allowEmailVisibility: v.boolean(),
    allowPhoneNumberVisibility: v.boolean(),
    primaryBrandColor: v.union([
      v.literal(""),
      v.pipe(v.string(), v.regex(HEX_COLOR, "must be a hex colour")),
    ]),
    secondaryBrandColor: v.union([
      v.literal(""),
      v.pipe(v.string(), v.regex(HEX_COLOR, "must be a hex colour")),
    ]),
    allowCustomBrandColor: v.boolean(),
    disableBranding: v.boolean(),
  }),
);

/** PATCH /me/account — credentials, locale and app preferences. */
export const UpdateAccountSchema = v.partial(
  v.object({
    email: v.pipe(v.string(), v.trim(), v.email(), v.maxLength(255)),
    phoneNumber: v.nullable(
      v.pipe(
        v.string(),
        v.trim(),
        v.maxLength(20),
        v.regex(/^\+?[0-9 ()-]{6,20}$/, "must be a valid phone number"),
      ),
    ),
    theme: v.picklist(["dark", "light", "system"]),
    appTheme: v.picklist(["dark", "light", "system"]),
    language: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(10)),
    timeZone: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
    defaultHome: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
    privacyMode: v.boolean(),
    twoFactorEnabled: v.boolean(),
    completeOnboarding: v.boolean(),
    lastViewed: nullableText(255),
  }),
);

/** PATCH /me/notifications — every opt-in toggle. */
export const UpdateNotificationsSchema = v.partial(
  v.object({
    allowNotification: v.boolean(),
    allowSMS: v.boolean(),
    notificationPlacement: v.picklist(NOTIFICATION_PLACEMENTS),
    allowMonthlyEmails: v.boolean(),
    allowInviteAcceptedEmails: v.boolean(),
    allowChangelogNewsletterEmails: v.boolean(),
    allowMarketingOnboardingEmails: v.boolean(),
    allowPrivacyLegalEmails: v.boolean(),
    allowDpaEmails: v.boolean(),
  }),
);

/** PUT /me/business — the legal entity behind the account. */
export const UpsertBusinessSchema = v.partial(
  v.object({
    legalName: trimmed(255),
    tradingName: nullableText(255),
    businessType: v.nullable(v.picklist(BUSINESS_TYPES)),
    registrationNumber: nullableText(64),
    taxId: nullableText(64),
    vatNumber: nullableText(64),
    industry: nullableText(128),
    website: v.nullable(
      v.union([
        v.literal(""),
        v.pipe(v.string(), v.trim(), v.url(), v.maxLength(255)),
      ]),
    ),
    description: nullableText(2000),
    supportEmail: v.nullable(
      v.union([
        v.literal(""),
        v.pipe(v.string(), v.trim(), v.email(), v.maxLength(255)),
      ]),
    ),
    supportPhone: nullableText(20),
    addressLine1: nullableText(255),
    addressLine2: nullableText(255),
    city: nullableText(128),
    region: nullableText(128),
    postalCode: nullableText(32),
    country: v.nullable(
      v.pipe(
        v.string(),
        v.trim(),
        v.toUpperCase(),
        v.length(2),
        v.regex(/^[A-Z]{2}$/, "must be an ISO 3166-1 alpha-2 country code"),
      ),
    ),
    statementDescriptor: nullableText(22),
    payoutCurrency: v.pipe(
      v.string(),
      v.trim(),
      v.toUpperCase(),
      v.length(3),
      v.regex(/^[A-Z]{3}$/, "must be an ISO 4217 currency code"),
    ),
  }),
);

export type UpdateProfileInput = v.InferOutput<typeof UpdateProfileSchema>;
export type UpdateAccountInput = v.InferOutput<typeof UpdateAccountSchema>;
export type UpdateNotificationsInput = v.InferOutput<
  typeof UpdateNotificationsSchema
>;
export type UpsertBusinessInput = v.InferOutput<typeof UpsertBusinessSchema>;
