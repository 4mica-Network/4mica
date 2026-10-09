import {
  CURRENCY_CODE_PATTERN,
  isUuidShaped,
  SLUG_MAX_LENGTH,
  SLUG_MESSAGE,
} from "@4mica/rules";
import { USERNAME_PATTERN } from "@4mica/url";
import {
  address,
  batchDeleteSchema,
  DEFAULT_PAGE_SIZE,
  decimalAmount,
  httpsUrl,
  MAX_PAGE_SIZE,
  PaymentNetworkSchema,
  PublicVisibilitySchema,
  positiveDecimalAmount,
  positiveInt,
  singleLine,
} from "@controllers/schema-primitives";
import * as v from "valibot";

const slug = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.minLength(1),
  v.maxLength(SLUG_MAX_LENGTH),
  v.regex(USERNAME_PATTERN, SLUG_MESSAGE),
  v.check((value) => !isUuidShaped(value), "must not look like an id"),
);

const name = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(120),
  singleLine,
);
const headline = v.pipe(v.string(), v.trim(), v.maxLength(160), singleLine);
const description = v.pipe(v.string(), v.trim(), v.maxLength(10_000));
const priceLabel = v.pipe(v.string(), v.trim(), v.maxLength(64), singleLine);

const url = httpsUrl(2048);

const priceCurrency = v.pipe(
  v.string(),
  v.trim(),
  v.toUpperCase(),
  v.regex(CURRENCY_CODE_PATTERN, "must be a currency code"),
);

const walletId = v.pipe(v.string(), v.uuid("must be a wallet id"));

const AgentStatusInputSchema = v.picklist(["PENDING", "ACTIVE"]);

export const CreateAgentSchema = v.object({
  name,
  slug: v.optional(slug),
  headline: v.optional(v.nullable(headline)),
  description: v.optional(v.nullable(description)),
  avatarUrl: v.optional(v.nullable(url)),
  docsUrl: v.optional(v.nullable(url)),
  status: v.optional(AgentStatusInputSchema, "PENDING"),
  visibility: v.optional(PublicVisibilitySchema, "PRIVATE"),
  network: v.optional(PaymentNetworkSchema, "ETHEREUM_SEPOLIA"),

  payerWalletId: v.optional(v.nullable(walletId)),
  creditLimit: v.optional(decimalAmount, "0"),

  walletId: v.optional(v.nullable(walletId)),
  assetAddress: v.optional(v.nullable(address)),
  priceAmount: v.optional(v.nullable(positiveDecimalAmount)),
  priceCurrency: v.optional(v.nullable(priceCurrency)),
  priceLabel: v.optional(v.nullable(priceLabel)),
  endpointUrl: v.optional(v.nullable(url)),
  x402Endpoint: v.optional(v.nullable(url)),
});

export const UpdateAgentSchema = v.partial(
  v.object({
    name,
    slug,
    headline: v.nullable(headline),
    description: v.nullable(description),
    avatarUrl: v.nullable(url),
    docsUrl: v.nullable(url),
    status: AgentStatusInputSchema,
    visibility: PublicVisibilitySchema,
    network: PaymentNetworkSchema,

    payerWalletId: v.nullable(walletId),
    creditLimit: decimalAmount,

    walletId: v.nullable(walletId),
    assetAddress: v.nullable(address),
    priceAmount: v.nullable(positiveDecimalAmount),
    priceCurrency: v.nullable(priceCurrency),
    priceLabel: v.nullable(priceLabel),
    endpointUrl: v.nullable(url),
    x402Endpoint: v.nullable(url),
  }),
);

export const BatchDeleteAgentsSchema = batchDeleteSchema("an agent id");

export const ListAgentsQuerySchema = v.object({
  page: positiveInt(1, Number.MAX_SAFE_INTEGER),
  limit: positiveInt(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
  status: v.optional(v.picklist(["PENDING", "ACTIVE", "SUSPENDED"])),
  visibility: v.optional(PublicVisibilitySchema),
  network: v.optional(PaymentNetworkSchema),
  sort: v.optional(
    v.picklist([
      "createdAt",
      "-createdAt",
      "updatedAt",
      "-updatedAt",
      "name",
      "-name",
    ]),
    "-createdAt",
  ),
});

export type CreateAgentInput = v.InferOutput<typeof CreateAgentSchema>;
export type UpdateAgentInput = v.InferOutput<typeof UpdateAgentSchema>;
export type ListAgentsQuery = v.InferOutput<typeof ListAgentsQuerySchema>;
