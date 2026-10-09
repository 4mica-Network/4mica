import { HEX_COLOR_PATTERN } from "@4mica/rules";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  usernameUnavailableReason,
} from "@4mica/url";
import {
  email,
  httpsUrl,
  phoneNumber,
  singleLine,
  webUrl,
} from "@controllers/schema-primitives";
import * as v from "valibot";

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

const isTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const LANGUAGES = ["en", "de", "fr", "es"] as const;

export const DEFAULT_HOMES = [
  "overview",
  "balances",
  "transactions",
  "payments",
  "agents",
] as const;

const requiredUsername = v.pipe(
  v.nullable(v.string()),
  v.transform((value) => (value ?? "").trim()),
  v.minLength(1, "a username is required"),
  usernamePipe,
);

export const CheckUsernameSchema = v.object({ username: usernameFormatPipe });

export type CheckUsernameInput = v.InferOutput<typeof CheckUsernameSchema>;

const nullableText = (max: number) =>
  v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(max)));

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

export const UpdateProfileSchema = v.partial(
  v.object({
    name: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(2, "must be at least 2 characters"),
      v.maxLength(120),
      singleLine,
    ),
    username: requiredUsername,
    bio: nullableText(2000),
    description: nullableText(2000),
    avatarUrl: v.nullable(httpsUrl(2048)),
    private: v.boolean(),
    hidden: v.boolean(),
    allowSEOIndexing: v.boolean(),
    allowEmailVisibility: v.boolean(),
    allowPhoneNumberVisibility: v.boolean(),
    primaryBrandColor: v.union([
      v.literal(""),
      v.pipe(v.string(), v.regex(HEX_COLOR_PATTERN, "must be a hex colour")),
    ]),
    secondaryBrandColor: v.union([
      v.literal(""),
      v.pipe(v.string(), v.regex(HEX_COLOR_PATTERN, "must be a hex colour")),
    ]),
    allowCustomBrandColor: v.boolean(),
    disableBranding: v.boolean(),
  }),
);

export const UpdateAccountSchema = v.partial(
  v.object({
    email: email(255),
    phoneNumber: v.nullable(phoneNumber),
    theme: v.picklist(["dark", "light", "system"]),
    appTheme: v.picklist(["dark", "light", "system"]),
    language: v.picklist(LANGUAGES, "is not a supported language"),
    timeZone: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1),
      v.maxLength(64),
      v.check(isTimeZone, "must be an IANA time zone"),
    ),
    defaultHome: v.picklist(DEFAULT_HOMES, "is not a page you can land on"),
    privacyMode: v.boolean(),
    completeOnboarding: v.boolean(),
    lastViewed: nullableText(255),
  }),
);

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

export const UpsertBusinessSchema = v.partial(
  v.object({
    legalName: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1, "cannot be empty"),
      v.maxLength(255),
    ),
    tradingName: nullableText(255),
    businessType: v.nullable(v.picklist(BUSINESS_TYPES)),
    registrationNumber: nullableText(64),
    taxId: nullableText(64),
    vatNumber: nullableText(64),
    industry: nullableText(128),
    website: v.nullable(v.union([v.literal(""), webUrl(255)])),
    description: nullableText(2000),
    supportEmail: v.nullable(v.union([v.literal(""), email(255)])),
    supportPhone: v.nullable(v.union([v.literal(""), phoneNumber])),
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
