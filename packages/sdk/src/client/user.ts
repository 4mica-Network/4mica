import type { TxReceiptWaitOptions } from "../contract";
import {
  type PaymentGuaranteeRequestClaims,
  type PaymentGuaranteeRequestClaimsV2,
  type PaymentSignature,
  SigningScheme,
  TabInfo,
  type TabPaymentStatus,
  type UserInfo,
} from "../models";
import { normalizeAddress, parseU256 } from "../utils";
import type { Client } from "./index";
import { tabStatusFromRpc } from "./shared";

/** Payer-side operations: collateral management, payment signing, withdrawals. */
export class UserClient {
  constructor(private client: Client) {}

  /** 32-byte V1 guarantee domain separator (hex-prefixed). */
  get guaranteeDomain(): string {
    return this.client.guaranteeDomain;
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
   * Query the on-chain payment status of a tab.
   *
   * @param tabId - Tab identifier.
   * @returns `{ paid, remunerated, asset }` — cumulative amount paid, whether
   *   it has been remunerated on-chain, and the asset address.
   */
  async getTabPaymentStatus(tabId: number | bigint): Promise<TabPaymentStatus> {
    const status = await this.client.gateway.getPaymentStatus(tabId);
    return tabStatusFromRpc(status);
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
   * List all tabs where the current signer is the payer.
   *
   * @param settlementStatuses - Optional filter on settlement status (e.g. `['pending']`).
   * @returns Array of tabs belonging to the current signer.
   */
  async listTabs(settlementStatuses?: string[]): Promise<TabInfo[]> {
    const myAddress = normalizeAddress(this.client.signer.signer.address);
    const raw = await this.client.rpc.listUserTabs(
      myAddress,
      settlementStatuses,
    );
    return raw.map((t) => TabInfo.fromRpc(t));
  }

  /**
   * Pay the remaining tab balance on-chain. Automatically resolves the recipient,
   * asset, and remaining amount from the tab and its latest guarantee.
   *
   * @param tabId - Tab identifier.
   * @param waitOptions - Optional timeout/polling overrides.
   * @throws if the tab is not found or has no guarantee.
   */
  async payTab(
    tabId: number | bigint,
    waitOptions?: TxReceiptWaitOptions,
  ): Promise<unknown>;

  /**
   * Pay a tab on-chain with explicit parameters.
   *
   * @param tabId - Tab identifier.
   * @param reqId - Request ID from the latest guarantee (used for ETH payment memo).
   * @param amount - Amount to pay (in token base units / wei).
   * @param recipientAddress - Address of the recipient.
   * @param erc20Token - ERC20 token address. Omit to pay in ETH.
   * @param waitOptions - Optional timeout/polling overrides.
   */
  async payTab(
    tabId: number | bigint,
    reqId: number | bigint,
    amount: number | bigint | string,
    recipientAddress: string,
    erc20Token?: string,
    waitOptions?: TxReceiptWaitOptions,
  ): Promise<unknown>;

  async payTab(
    tabId: number | bigint,
    reqIdOrWaitOptions?: number | bigint | TxReceiptWaitOptions,
    amount?: number | bigint | string,
    recipientAddress?: string,
    erc20Token?: string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    // Simple overload: auto-resolve from tab + latest guarantee
    if (
      reqIdOrWaitOptions === undefined ||
      (typeof reqIdOrWaitOptions === "object" &&
        reqIdOrWaitOptions !== null &&
        !(
          "valueOf" in reqIdOrWaitOptions &&
          typeof reqIdOrWaitOptions.valueOf() === "bigint"
        ))
    ) {
      const opts = reqIdOrWaitOptions as TxReceiptWaitOptions | undefined;
      const tab = await this.client.recipient.getTab(tabId);
      if (!tab) throw new Error(`Tab ${tabId} not found`);
      const guarantee = await this.client.recipient.getLatestGuarantee(tabId);
      if (!guarantee) throw new Error(`Tab ${tabId} has no guarantee`);
      const remaining =
        tab.totalAmount > tab.paidAmount
          ? tab.totalAmount - tab.paidAmount
          : 0n;
      if (remaining === 0n) {
        throw new Error(`Tab ${tabId} is already fully paid`);
      }
      const isEth =
        tab.assetAddress === "0x0000000000000000000000000000000000000000";
      return isEth
        ? this.client.gateway.payTabEth(
            tabId,
            guarantee.reqId,
            remaining,
            tab.recipientAddress,
            opts,
          )
        : this.client.gateway.payTabErc20(
            tabId,
            remaining,
            tab.assetAddress,
            tab.recipientAddress,
            opts,
          );
    }

    // Explicit overload
    const reqId = reqIdOrWaitOptions as number | bigint;
    if (erc20Token) {
      return this.client.gateway.payTabErc20(
        tabId,
        amount!,
        erc20Token,
        recipientAddress!,
        waitOptions,
      );
    }
    return this.client.gateway.payTabEth(
      tabId,
      reqId,
      amount!,
      recipientAddress!,
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
