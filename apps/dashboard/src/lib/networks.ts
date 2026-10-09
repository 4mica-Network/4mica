import {
  PAYMENT_NETWORK_IDS,
  PAYMENT_NETWORKS,
  type PaymentNetwork,
} from "@4mica/rules";

export const NETWORK_OPTIONS = PAYMENT_NETWORK_IDS.map((value) => ({
  value,
  title: PAYMENT_NETWORKS[value].label,
}));

export const chainDefinition = (network: PaymentNetwork) => {
  const meta = PAYMENT_NETWORKS[network];
  return {
    chainId: meta.chainId,
    chainName: meta.label,
    rpcUrls: [meta.rpcUrl],
    blockExplorerUrls: [meta.explorer],
    nativeCurrency: { ...meta.currency },
  };
};
