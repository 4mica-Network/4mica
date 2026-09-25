import * as v from "valibot";
import { PaymentNetworkSchema, VisibilitySchema } from "./params";

const PublicAgentSchema = v.object({
  id: v.string(),
  ref: v.string(),
  name: v.string(),
  headline: v.nullable(v.string()),
  description: v.nullable(v.string()),
  avatarUrl: v.nullable(v.string()),
  docsUrl: v.nullable(v.string()),
  status: v.picklist(["PENDING", "ACTIVE", "SUSPENDED"] as const),
  visibility: VisibilitySchema,
  createdAt: v.string(),
  publishedAt: v.nullable(v.string()),
  network: PaymentNetworkSchema,

  walletAddress: v.nullable(v.string()),

  payToAddress: v.nullable(v.string()),
  assetAddress: v.nullable(v.string()),
  priceAmount: v.nullable(v.string()),
  priceCurrency: v.nullable(v.string()),
  priceLabel: v.nullable(v.string()),
  endpointUrl: v.nullable(v.string()),
  x402Endpoint: v.nullable(v.string()),
});

export type PublicAgent = v.InferOutput<typeof PublicAgentSchema>;
