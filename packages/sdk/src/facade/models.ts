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
  /**
   * Counted in memory by this session only; processes sharing a wallet each
   * get their own.
   */
  total?: string | readonly string[];
  payTo?: readonly string[];
}

export interface GovernanceOptions {
  apiKey: string;
  baseUrl?: string;
  agentId?: string;
  approvalTimeoutMs?: number;
  pollIntervalMs?: number;
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
  governance?: GovernanceOptions;
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

/**
 * A net position the wallet can still settle: a debit to pay or a credit to
 * claim, for one asset in one settlement cycle. Within a cycle a wallet is
 * a debtor or a creditor, never both.
 */
export interface Position {
  /** The cycle, as `settlement.pay(...)` and `settlement.claim(...)` take it. */
  cycle: string;
  /** The cycle's on-chain `bytes32` id. */
  cycleId: string;
  asset: AssetRef;
  /** A debtor pays `amount`; a creditor claims it. */
  role: "debtor" | "creditor";
  /** The net amount. */
  amount: string;
  /** What the wallet paid others in the cycle, before netting. */
  grossOutgoing: string;
  /** What others paid the wallet in the cycle, before netting. */
  grossIncoming: string;
  raw: { amount: bigint; grossOutgoing: bigint; grossIncoming: bigint };
  /** A debit has to be paid by this time; the contract refuses it after. */
  payBy: Date;
  /**
   * After this time an unpaid debit is taken from the debtor's collateral.
   * A credit can be claimed once every debtor in the cycle has paid, and
   * otherwise from this time on.
   */
  finalAt: Date;
  /**
   * Whether the cycle's commit is final on-chain. Until it is, a payment
   * can revert and both times are core's estimate.
   */
  commitConfirmed: boolean;
  /** CAIP-2 id. */
  network: string;
}

export interface SettleOptions extends NetworkOption {
  /** `"pay"` settles only what the wallet owes; `"claim"` only what it is owed. */
  only?: "pay" | "claim";
}

/** What became of one position in a `settle()` call. */
export interface SettleResult {
  position: Position;
  action: "pay" | "claim";
  /**
   * - `"settled"`: paid or claimed; `txHash` is the transaction.
   * - `"skipped"`: not attempted; `reason` says why.
   * - `"failed"`: refused or reverted; `error` says why. Nothing moved.
   * - `"unknown"`: sent, and no answer came back (`error` is an
   *   `OutcomeUnknownError`). Check before settling again: it may have
   *   gone through.
   */
  status: "settled" | "skipped" | "failed" | "unknown";
  txHash?: string;
  /** How it reached the chain: a payment moves a token, so it names the scheme. */
  route?: Route | TokenRoute;
  explorerUrl?: string;
  reason?: string;
  error?: Error;
}

export interface PaymentRecord {
  protocol: string;
  network: string;
  asset: AssetRef;
  amount: string;
  amountRaw: bigint;
  payTo: string;
}
