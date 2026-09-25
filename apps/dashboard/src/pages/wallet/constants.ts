import type { WalletRole, WalletStatus } from "@stores/wallet/type";

export {
  chainDefinition,
  explorerAddressUrl,
  NETWORK_OPTIONS,
  NETWORKS,
  networkForChainId,
  shortenAddress,
} from "@/lib/networks";

export const ROLE_LABEL_KEYS = {
  PAYER: "wallet.role.payer",
  RECIPIENT: "wallet.role.recipient",
  BOTH: "wallet.role.both",
} as const satisfies Record<WalletRole, string>;

export const STATUS_LABEL_KEYS = {
  ACTIVE: "wallet.status.active",
  PAUSED: "wallet.status.paused",
  RETIRED: "wallet.status.retired",
} as const satisfies Record<WalletStatus, string>;

export const STATUS_TAG_VARIANT = {
  ACTIVE: "success",
  PAUSED: "warning",
  RETIRED: "neutral",
} as const satisfies Record<WalletStatus, "success" | "warning" | "neutral">;
