export const PAYMENT_NETWORK = {
  BASE: "BASE",
  BASE_SEPOLIA: "BASE_SEPOLIA",
  ETHEREUM_SEPOLIA: "ETHEREUM_SEPOLIA",
} as const;

export type PaymentNetwork =
  (typeof PAYMENT_NETWORK)[keyof typeof PAYMENT_NETWORK];

export const WALLET_ROLE = {
  PAYER: "PAYER",
  RECIPIENT: "RECIPIENT",
  BOTH: "BOTH",
} as const;

export type WalletRole = (typeof WALLET_ROLE)[keyof typeof WALLET_ROLE];

export const WALLET_STATUS = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  RETIRED: "RETIRED",
} as const;

export type WalletStatus = (typeof WALLET_STATUS)[keyof typeof WALLET_STATUS];

export type WalletVerificationMethod = "EOA_SIGNATURE" | "ERC1271";

export interface Wallet {
  id: string;
  label: string;
  description: string | null;
  /** Stored lowercase; render with `toChecksumAddress` where it matters. */
  address: string;
  network: PaymentNetwork;
  role: WalletRole;
  status: WalletStatus;
  isDefault: boolean;
  verifiedAt: string;
  verificationMethod: WalletVerificationMethod;
  verifiedChainId: number;
  createdAt: string;
  updatedAt: string;
}

/** The message the server built and the client must sign verbatim. */
export interface WalletChallenge {
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface WalletListResponse {
  items: Wallet[];
  total: number;
  page: number;
  limit: number;
}

export interface BatchDeleteResult {
  deleted: string[];
  notFound: string[];
}

export interface WalletFilters {
  q: string;
  status: WalletStatus | "";
  network: PaymentNetwork | "";
}

export type WalletState = {
  items: Wallet[];
  total: number;
  page: number;
  limit: number;
  filters: WalletFilters;
  /** Ids ticked for a batch action. Cleared whenever the page changes. */
  selectedIds: string[];
  isLoading: boolean;
  /**
   * Sticky once the first fetch lands, so re-filtering redraws rows in place
   * rather than blanking the list under the toolbar.
   */
  hasLoaded: boolean;
  pending: Record<string, boolean>;
  error: string | null;
  validationIssues: Record<string, string>;
};
