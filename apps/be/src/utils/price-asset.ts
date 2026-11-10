import {
  findPaymentAsset,
  PAYMENT_NETWORKS,
  type PaymentNetwork,
} from "@4mica/rules";
import type { ValidationIssue } from "@controllers/shared";

export type PriceAssetResult =
  | { ok: true; assetAddress: string | null; priceCurrency: string | null }
  | { ok: false; issue: ValidationIssue };

/**
 * The token a price is paid in, and the currency shown for it, always come as
 * a pair from the network's supported assets. Taking the currency from the
 * caller is how a listing ended up labelled USDC while charging ETH.
 */
export const resolvePriceAsset = (
  network: PaymentNetwork | null,
  assetAddress: string | null,
): PriceAssetResult => {
  if (!network) {
    return { ok: true, assetAddress: null, priceCurrency: null };
  }

  const asset = findPaymentAsset(network, assetAddress);
  if (!asset) {
    return {
      ok: false,
      issue: {
        path: "assetAddress",
        message: `is not a token 4Mica accepts on ${PAYMENT_NETWORKS[network].label}`,
      },
    };
  }

  return { ok: true, assetAddress: asset.address, priceCurrency: asset.symbol };
};
