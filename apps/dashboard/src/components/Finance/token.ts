import {
  findPaymentAsset,
  PAYMENT_ASSETS,
  PAYMENT_NETWORK_IDS,
  PAYMENT_NETWORKS,
  type PaymentNetwork,
  shortenAddress,
} from "@4mica/rules";

export const isPaymentNetwork = (value: unknown): value is PaymentNetwork =>
  PAYMENT_NETWORK_IDS.includes(value as PaymentNetwork);

export const tokenKey = (
  network: PaymentNetwork,
  assetAddress: string | null,
): string => `${network}:${assetAddress?.toLowerCase() ?? ""}`;

export const parseTokenKey = (
  key: string,
): { network: PaymentNetwork; assetAddress: string | null } | null => {
  const [network, address = ""] = key.split(":");
  return isPaymentNetwork(network)
    ? { network, assetAddress: address || null }
    : null;
};

export const assetSymbol = (
  network: PaymentNetwork,
  assetAddress: string | null,
): string =>
  findPaymentAsset(network, assetAddress)?.symbol ??
  (assetAddress ? shortenAddress(assetAddress) : "");

export const tokenLabel = (
  network: PaymentNetwork | null,
  assetAddress: string | null,
): string =>
  network && isPaymentNetwork(network)
    ? `${assetSymbol(network, assetAddress)} · ${PAYMENT_NETWORKS[network].label}`
    : "";

export const tokenOptions = (networks: readonly PaymentNetwork[]) =>
  networks.flatMap((network) =>
    PAYMENT_ASSETS[network].map((asset) => ({
      value: tokenKey(network, asset.address),
      title: `${asset.symbol} · ${PAYMENT_NETWORKS[network].label}`,
    })),
  );
