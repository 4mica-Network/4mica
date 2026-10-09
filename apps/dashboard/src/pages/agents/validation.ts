import { isSingleLine } from "@4mica/rules";
import { PUBLIC_VISIBILITY } from "@stores/shared/type";
import {
  addressOrBlank,
  currencyOrBlank,
  decimalAmount,
  httpsUrl,
  orBlank,
  paymentNetwork,
  positiveAmount,
  slugOrBlank,
} from "@utils/zod";
import { z } from "zod";

export const NAME_MAX_LENGTH = 120;
export const HEADLINE_MAX_LENGTH = 160;
export const DESCRIPTION_MAX_LENGTH = 10_000;

const NS = "agent.errors";
const optionalHttpsUrl = orBlank(httpsUrl(NS));

export const agentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "agent.errors.nameRequired")
    .max(NAME_MAX_LENGTH, "agent.errors.nameTooLong")
    .refine(isSingleLine, "validation.singleLine"),
  slug: slugOrBlank(NS),
  headline: orBlank(
    z
      .string()
      .trim()
      .max(HEADLINE_MAX_LENGTH, "agent.errors.headlineTooLong")
      .refine(isSingleLine, "validation.singleLine"),
  ),
  description: orBlank(
    z
      .string()
      .trim()
      .max(DESCRIPTION_MAX_LENGTH, "agent.errors.descriptionTooLong"),
  ),

  network: paymentNetwork,
  status: z.enum(["PENDING", "ACTIVE"]),
  visibility: z.enum(PUBLIC_VISIBILITY),

  payerWalletId: orBlank(z.string()),
  creditLimit: orBlank(decimalAmount(`${NS}.priceInvalid`)),

  walletId: orBlank(z.string()),
  assetAddress: addressOrBlank(`${NS}.assetInvalid`),
  priceAmount: orBlank(positiveAmount(NS)),
  priceCurrency: currencyOrBlank("agent.errors.currencyInvalid"),
  priceLabel: orBlank(
    z
      .string()
      .trim()
      .max(64, "agent.errors.priceLabelTooLong")
      .refine(isSingleLine, "validation.singleLine"),
  ),
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
