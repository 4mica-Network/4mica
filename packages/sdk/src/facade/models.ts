import type { Account } from "viem/accounts";
import type { TokenLike } from "@/amounts";
import type { Route, TokenRoute } from "@/client/model";

export type AssetRef = TokenLike;

/**
 * Amounts are written like deposits, `"1 USDC"`. A payment is only allowed in
 * an asset a `perPayment` entry names.
 */
export interface SpendLimits {
  /** Default `"1 USDC"`. */
  perPayment?: string | readonly string[];
  total?: string | readonly string[];
  payTo?: readonly string[];
}

export interface FourMicaOptions {
  privateKey?: string;
  /** Any viem `Account` with `signTypedData` and `signMessage`. */
  signer?: Account;
  /** Read for `FOURMICA_*` when neither `privateKey` nor `signer` is given. */
  env?: Record<string, string | undefined>;
  /** Default `FOURMICA_NETWORK`, else `DEFAULT_NETWORK`. */
  network?: string;
  facilitatorUrl?: string;
  /** Self-hosted core. */
  rpcUrl?: string;
  spend?: SpendLimits;
  /** In order of preference. Default `["x402"]`. */
  protocols?: readonly string[];
  fetch?: typeof fetch;
}

export interface NetworkOption {
  network?: string;
}

export interface DepositOptions extends NetworkOption {
  /** `"self"` sends the wallet's own transaction. Default `"auto"`. */
  gas?: "auto" | "self";
  /** `"mined"` skips waiting for core to count the deposit. */
  wait?: "spendable" | "mined";
  /** Default 60 000. */
  timeoutMs?: number;
}

export interface DepositResult {
  /** `"pending"`: mined, but not yet counted by core when the wait ended. */
  status: "spendable" | "pending" | "mined";
  txHash: string;
  route: TokenRoute;
  amount: string;
  amountRaw: bigint;
  asset: AssetRef;
  /** CAIP-2 id. */
  network: string;
  explorerUrl?: string;
  spendable(options?: { timeoutMs?: number }): Promise<DepositResult>;
}

export interface Balance {
  asset: AssetRef;
  total: string;
  locked: string;
  available: string;
  raw: { total: bigint; locked: bigint; available: bigint };
}

/** Keyed by symbol, or by address where two assets share one. */
export type Balances = Record<string, Balance>;

export interface WithdrawResult {
  txHash: string;
  route: Route;
  asset: AssetRef;
  network: string;
  explorerUrl?: string;
}

export interface PendingWithdrawal {
  asset: AssetRef;
  amount: string;
  amountRaw: bigint;
  requestedAt: Date;
  readyAt: Date;
  ready: boolean;
  network: string;
}

export interface PaymentRecord {
  protocol: string;
  network: string;
  asset: AssetRef;
  amount: string;
  amountRaw: bigint;
  payTo: string;
}
