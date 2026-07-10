import type { Hex } from "viem";
import type { Client } from "@/client/index";
import type { TxReceiptWaitOptions } from "@/contract";
import {
  ClearingSettlementActionResponse,
  type PaymentGuaranteeRequestClaims,
  type PaymentGuaranteeRequestClaimsV2,
  type PaymentSignature,
  SigningScheme,
  type UserInfo,
} from "@/models";
import { ensureHexPrefix, normalizeAddress, parseU256 } from "@/utils";

/** Payer-side operations: collateral management, payment signing, withdrawals. */
export class UserClient {
  constructor(private client: Client) {}

  /** 32-byte V1 guarantee domain separator (hex-prefixed). */
  get guaranteeDomain(): string {
    return this.client.guaranteeDomain;
  }

  private get userAddress(): string {
    return normalizeAddress(this.client.signer.signer.address);
  }

  /**
   * Approve the Core4Mica contract to spend an ERC20 token on your behalf.
   * Call this before {@link deposit} for ERC20 deposits.
   *
   * @param token - ERC20 token contract address.
   * @param amount - Amount to approve (in token base units).
   * @param waitOptions - Optional timeout/polling overrides for receipt polling.
   */
  async approveErc20(
    token: string,
    amount: number | bigint | string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    return this.client.gateway.approveErc20(token, amount, waitOptions);
  }

  /**
   * Deposit collateral into the Core4Mica contract.
   *
   * @param amount - Amount to deposit (in wei for ETH, base units for ERC20).
   * @param erc20Token - ERC20 token address. Omit to deposit ETH.
   *   Call {@link approveErc20} first when depositing ERC20.
   * @param waitOptions - Optional timeout/polling overrides.
   */
  async deposit(
    amount: number | bigint | string,
    erc20Token?: string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    return this.client.gateway.deposit(amount, erc20Token, waitOptions);
  }

  /**
   * Fetch all asset positions for the current signer.
   *
   * @returns Array of positions — one entry per deposited asset, including
   *   locked collateral and any pending withdrawal.
   * @throws {@link ContractError} if the contract call fails.
   */
  async getUser(opts?: { blockNumber?: bigint }): Promise<UserInfo[]> {
    const assets = await this.client.gateway.getUserAssets(opts);
    return assets.map(
      (a) =>
        ({
          asset: a.asset,
          collateral: parseU256(a.collateral),
          withdrawalRequestAmount: parseU256(a.withdrawalRequestAmount),
          withdrawalRequestTimestamp: Number(a.withdrawalRequestTimestamp),
        }) satisfies UserInfo,
    );
  }

  /**
   * Sign a payment guarantee request with the configured signer.
   *
   * @param claims - V1 or V2 payment claims. Build V1 with
   *   {@link PaymentGuaranteeRequestClaims.new}; build V2 with
   *   {@link PaymentGuaranteeRequestClaimsV2} (requires validation policy fields).
   * @param scheme - Signing scheme. Defaults to `EIP712`.
   *   Use `EIP191` for wallets that do not support typed data.
   * @returns 65-byte ECDSA signature plus the scheme used.
   * @throws {@link SigningError} if the signer address does not match `claims.userAddress`
   *   or the signing scheme is not supported by the account.
   */
  async signPayment(
    claims: PaymentGuaranteeRequestClaims | PaymentGuaranteeRequestClaimsV2,
    scheme: SigningScheme = SigningScheme.EIP712,
  ): Promise<PaymentSignature> {
    return this.client.signer.signRequest(this.client.params, claims, scheme);
  }

  /**
   * Fetch the prepared `payNetDebit` action for the current signer in a cycle.
   *
   * @param cycleId - On-chain `bytes32` cycle identifier.
   */
  async getClearingPayNetDebitAction(
    cycleId: string,
  ): Promise<ClearingSettlementActionResponse> {
    const raw = await this.client.rpc.getClearingPayNetDebitAction(
      cycleId,
      this.userAddress,
    );
    return ClearingSettlementActionResponse.fromRpc(raw);
  }

  /**
   * Pay the current signer's committed net debit for a settlement cycle on-chain.
   *
   * Fetches the prepared clearing action (contract address, amount, native value,
   * and Merkle proof) from core, then submits `payNetDebit` to the ClearingHouse.
   *
   * @param cycleId - On-chain `bytes32` cycle identifier.
   * @param waitOptions - Optional timeout/polling overrides.
   * @throws {@link ContractError} if the contract call fails.
   */
  async payNetDebit(cycleId: string, waitOptions?: TxReceiptWaitOptions) {
    const action = await this.getClearingPayNetDebitAction(cycleId);
    return this.client.gateway.payNetDebit(
      action.contractAddress,
      ensureHexPrefix(action.cycleId) as Hex,
      action.amount,
      action.proof.map((p) => ensureHexPrefix(p) as Hex),
      action.payableValue,
      waitOptions,
    );
  }

  /**
   * Fetch the prepared `markDefaulted` action against a debtor in a cycle.
   *
   * @param cycleId - On-chain `bytes32` cycle identifier.
   * @param debtor - Address of the defaulted debtor.
   */
  async getClearingMarkDefaultedAction(
    cycleId: string,
    debtor: string,
  ): Promise<ClearingSettlementActionResponse> {
    const raw = await this.client.rpc.getClearingMarkDefaultedAction(
      cycleId,
      normalizeAddress(debtor),
    );
    return ClearingSettlementActionResponse.fromRpc(raw);
  }

  /**
   * Mark a debtor defaulted after the clearing payment finality deadline.
   *
   * @param cycleId - On-chain `bytes32` cycle identifier.
   * @param debtor - Address of the defaulted debtor.
   * @param waitOptions - Optional timeout/polling overrides.
   * @throws {@link ContractError} if the contract call fails.
   */
  async markDefaulted(
    cycleId: string,
    debtor: string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const action = await this.getClearingMarkDefaultedAction(cycleId, debtor);
    return this.client.gateway.markDefaulted(
      action.contractAddress,
      ensureHexPrefix(action.cycleId) as Hex,
      normalizeAddress(action.debtor ?? action.participant) as Hex,
      action.amount,
      action.proof.map((p) => ensureHexPrefix(p) as Hex),
      waitOptions,
    );
  }

  /**
   * Initiate a collateral withdrawal request. The withdrawal is subject to an
   * on-chain timelock before it can be finalised.
   *
   * @param amount - Amount to withdraw (base units / wei).
   * @param erc20Token - ERC20 token address. Omit to withdraw ETH.
   * @param waitOptions - Optional timeout/polling overrides.
   */
  async requestWithdrawal(
    amount: number | bigint | string,
    erc20Token?: string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    return this.client.gateway.requestWithdrawal(
      amount,
      erc20Token,
      waitOptions,
    );
  }

  /**
   * Cancel a pending withdrawal request before the timelock expires.
   *
   * @param erc20Token - ERC20 token address. Omit to cancel an ETH withdrawal.
   * @param waitOptions - Optional timeout/polling overrides.
   */
  async cancelWithdrawal(
    erc20Token?: string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    return this.client.gateway.cancelWithdrawal(erc20Token, waitOptions);
  }

  /**
   * Finalise a withdrawal after the timelock has elapsed.
   *
   * @param erc20Token - ERC20 token address. Omit to finalise an ETH withdrawal.
   * @param waitOptions - Optional timeout/polling overrides.
   */
  async finalizeWithdrawal(
    erc20Token?: string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    return this.client.gateway.finalizeWithdrawal(erc20Token, waitOptions);
  }
}
