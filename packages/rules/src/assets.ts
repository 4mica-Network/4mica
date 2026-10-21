import { PAYMENT_NETWORKS, type PaymentNetwork } from "./networks";

export interface PaymentAsset {
  address: string | null;
  symbol: string;
  name: string;
  decimals: number;
}

const native = (network: PaymentNetwork): PaymentAsset => ({
  address: null,
  ...PAYMENT_NETWORKS[network].currency,
});

const usdc = (address: string): PaymentAsset => ({
  address: address.toLowerCase(),
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
});

export const PAYMENT_ASSETS: Record<PaymentNetwork, readonly PaymentAsset[]> = {
  BASE: [native("BASE"), usdc("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")],
  BASE_SEPOLIA: [
    native("BASE_SEPOLIA"),
    usdc("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
  ],
  ETHEREUM_SEPOLIA: [
    native("ETHEREUM_SEPOLIA"),
    usdc("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"),
  ],
};

export const findPaymentAsset = (
  network: PaymentNetwork,
  address: string | null,
): PaymentAsset | null =>
  PAYMENT_ASSETS[network].find(
    (asset) => asset.address === (address?.toLowerCase() ?? null),
  ) ?? null;
