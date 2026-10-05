import { USERNAME_PATTERN } from "@4mica/url";
import { isAddress } from "viem";
import { z } from "zod";

export const NAME_MAX_LENGTH = 120;
export const HEADLINE_MAX_LENGTH = 160;
export const DESCRIPTION_MAX_LENGTH = 10_000;

const decimalAmount = z
  .string()
  .trim()
  .regex(/^(?!0\d)\d{1,20}(\.\d{1,18})?$/, "agent.errors.priceInvalid");

const positiveDecimal = decimalAmount
  .refine((value) => Number(value) > 0, "agent.errors.pricePositive")
  .optional()
  .or(z.literal(""));

const creditLimitField = decimalAmount.optional().or(z.literal(""));

const httpsUrl = z
  .string()
  .trim()
  .url("agent.errors.urlInvalid")
  .max(2048, "agent.errors.urlTooLong")
  .refine((value) => value.startsWith("https://"), "agent.errors.urlHttps");

const optionalHttpsUrl = httpsUrl.optional().or(z.literal(""));

const optionalAddress = z
  .string()
  .trim()
  .refine(
    (value): boolean => value === "" || isAddress(value, { strict: true }),
    "agent.errors.assetInvalid",
  )
  .optional()
  .or(z.literal(""));

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(64, "agent.errors.slugTooLong")
  .refine(
    (value) => value === "" || USERNAME_PATTERN.test(value),
    "agent.errors.slugInvalid",
  )
  .optional()
  .or(z.literal(""));

export const agentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "agent.errors.nameRequired")
    .max(NAME_MAX_LENGTH, "agent.errors.nameTooLong"),
  slug: slugField,
  headline: z
    .string()
    .trim()
    .max(HEADLINE_MAX_LENGTH, "agent.errors.headlineTooLong")
    .optional()
    .or(z.literal("")),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX_LENGTH, "agent.errors.descriptionTooLong")
    .optional()
    .or(z.literal("")),

  network: z.enum(["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"]),
  status: z.enum(["PENDING", "ACTIVE"]),
  visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]),

  payerWalletId: z.string().optional().or(z.literal("")),
  creditLimit: creditLimitField,

  walletId: z.string().optional().or(z.literal("")),
  assetAddress: optionalAddress,
  priceAmount: positiveDecimal,
  priceCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,16}$/, "agent.errors.currencyInvalid")
    .optional()
    .or(z.literal("")),
  priceLabel: z
    .string()
    .trim()
    .max(64, "agent.errors.priceLabelTooLong")
    .optional()
    .or(z.literal("")),
  endpointUrl: optionalHttpsUrl,
  x402Endpoint: optionalHttpsUrl,
  docsUrl: optionalHttpsUrl,
  avatarUrl: optionalHttpsUrl,
});

export type AgentValues = z.infer<typeof agentSchema>;

export const CREATE_STEP_FIELDS = [
  ["name", "slug", "headline", "description"],
  ["network", "payerWalletId", "creditLimit"],
  [
    "walletId",
    "assetAddress",
    "priceAmount",
    "priceCurrency",
    "priceLabel",
    "endpointUrl",
  ],
  ["docsUrl", "avatarUrl", "x402Endpoint", "status", "visibility"],
] as const satisfies readonly (readonly (keyof AgentValues)[])[];

export const blankToNull = (value: string | undefined | null): string | null =>
  value == null || value.trim() === "" ? null : value.trim();
