import { signatureToWordsAsync } from "../bls";
import type { TxReceiptWaitOptions } from "../contract";
import { DEBUG_CERTS } from "../debug";
import { VerificationError } from "../errors";
import { decodeGuaranteeClaims } from "../guarantee";
import {
  AssetBalanceInfo,
  type BLSCert,
  CollateralEventInfo,
  GuaranteeInfo,
  type PaymentGuaranteeClaims,
  type PaymentGuaranteeRequestClaims,
  type PaymentGuaranteeRequestClaimsV2,
  PendingRemunerationInfo,
  RecipientPaymentInfo,
  type SigningScheme,
  TabInfo,
  type TabPaymentStatus,
} from "../models";
import { buildPaymentPayload } from "../payment";
import { normalizeAddress, parseU256 } from "../utils";
import type { Client } from "./index";
import { isNumericLike, tabStatusFromRpc } from "./shared";

/** Recipient-side operations: tab management, guarantee issuance, remuneration. */
export class RecipientClient {
  constructor(private client: Client) {}

  private get recipientAddress(): string {
    return normalizeAddress(this.client.signer.signer.address);
  }

  get guaranteeDomain(): string {
    return this.client.guaranteeDomain;
  }

  /**
   * Create a payment tab via the core RPC.
   *
   * @param userAddress - Address of the payer.
   * @param recipientAddress - Address of the recipient.
   * @param erc20Token - ERC20 token address for the tab, or `null`/`undefined` for ETH.
   * @param ttl - Optional time-to-live in seconds.
   * @param guaranteeVersion - Guarantee version for the version-scoped tab identity.
   * @returns `{ tabId, assetAddress, nextReqId }` — the tab ID, the asset address as stored
   *   by the core (use this for all subsequent claims), and the first request ID to use.
   * @throws {@link RpcError} if the request fails.
   */
  async createTab(
    userAddress: string,
    recipientAddress: string,
    erc20Token: string | undefined | null,
    ttl?: number | null,
    guaranteeVersion = 1,
  ): Promise<{ tabId: bigint; assetAddress: string; nextReqId: bigint }> {
    const body = {
      user_address: normalizeAddress(userAddress),
      recipient_address: normalizeAddress(recipientAddress),
      erc20_token: erc20Token ? normalizeAddress(erc20Token) : null,
      ttl: ttl ?? null,
      guarantee_version: guaranteeVersion,
    };
    const result = await this.client.rpc.createPaymentTab(body);
    const record = result as Record<string, unknown>;
    const tabIdRaw = record.id ?? record.tabId ?? record.tab_id;
    const tabId = isNumericLike(tabIdRaw) ? tabIdRaw : 0;
    const erc20Raw = record.erc20_token ?? record.erc20Token;
    const assetAddress =
      typeof erc20Raw === "string" && erc20Raw
        ? erc20Raw
        : "0x0000000000000000000000000000000000000000";
    const nextReqIdRaw = record.next_req_id ?? record.nextReqId ?? 0;
    return {
      tabId: parseU256(tabId),
      assetAddress,
      nextReqId: parseU256(isNumericLike(nextReqIdRaw) ? nextReqIdRaw : 0),
    };
  }

  /**
   * Query the on-chain payment status of a tab.
   *
   * @param tabId - Tab identifier.
   * @returns `{ paid, remunerated, asset }`.
   */
  async getTabPaymentStatus(tabId: number | bigint): Promise<TabPaymentStatus> {
    const status = await this.client.gateway.getPaymentStatus(tabId);
    return tabStatusFromRpc(status);
  }

  /**
   * Issue a BLS-signed payment guarantee certificate via the core RPC.
   *
   * The returned {@link BLSCert} can be stored and later passed to
   * {@link remunerate} to claim the payment on-chain.
   *
   * @param claims - Signed payment claims (V1 or V2).
   * @param signature - ECDSA signature hex string from the payer.
   * @param scheme - Signing scheme used to produce the signature.
   * @returns BLS certificate with ABI-encoded claims and BLS signature.
   * @throws {@link RpcError} if the core service rejects the request.
   */
  async issuePaymentGuarantee(
    claims: PaymentGuaranteeRequestClaims | PaymentGuaranteeRequestClaimsV2,
    signature: string,
    scheme: SigningScheme,
  ): Promise<BLSCert> {
    const payload = buildPaymentPayload(claims, signature, scheme);
    const cert = await this.client.rpc.issueGuarantee(payload);
    const record = cert as Record<string, unknown>;
    const certClaims = typeof record.claims === "string" ? record.claims : "";
    const signatureOut =
      typeof record.signature === "string" ? record.signature : "";
    return { claims: certClaims, signature: signatureOut };
  }

  /**
   * Verify and decode a BLS guarantee certificate.
   *
   * Decodes the ABI-encoded claims and validates the domain separator against
   * the on-chain configuration. For V2 certificates, the active V2 domain is
   * fetched from the contract and verified to be enabled.
   *
   * @param cert - BLS certificate (hex-encoded claims + hex-encoded signature).
   * @returns Decoded {@link PaymentGuaranteeClaims}, including validation policy for V2.
   * @throws {@link VerificationError} on domain mismatch, invalid length, or disabled version.
   */
  async verifyPaymentGuarantee(cert: BLSCert): Promise<PaymentGuaranteeClaims> {
    const claims = decodeGuaranteeClaims(cert.claims);
    let expectedDomain: string;
    if (claims.version === 2) {
      const { domainSeparator, enabled } =
        await this.client.gateway.getGuaranteeVersionConfig(2);
      if (!enabled) {
        throw new VerificationError(
          "guarantee version 2 is not enabled on-chain",
        );
      }
      expectedDomain = domainSeparator;
    } else {
      expectedDomain = this.guaranteeDomain;
    }
    const domainHex = expectedDomain.startsWith("0x")
      ? expectedDomain.slice(2)
      : Buffer.from(expectedDomain).toString("hex");
    if (domainHex.length !== 64) {
      throw new VerificationError(
        `guarantee domain separator has invalid length: expected 32 bytes, got ${domainHex.length / 2}`,
      );
    }
    const claimsHex = Buffer.from(claims.domain).toString("hex");
    if (claimsHex !== domainHex) {
      throw new VerificationError("guarantee domain mismatch");
    }
    return claims;
  }

  /**
   * Claim payment on-chain by submitting a verified BLS certificate.
   *
   * Verifies the certificate first (see {@link verifyPaymentGuarantee}), then
   * converts the BLS signature into the G2 coordinate words expected by the
   * contract and submits the `remunerate` transaction.
   *
   * Requires the optional `@noble/curves` package for BLS point decompression.
   *
   * @param cert - BLS certificate to settle.
   * @param waitOptions - Optional timeout/polling overrides for receipt polling.
   * @throws {@link VerificationError} if the certificate is invalid or `claims`/`signature`
   *   are not hex strings.
   * @throws {@link ContractError} if the contract call fails.
   */
  async remunerate(cert: BLSCert, waitOptions?: TxReceiptWaitOptions) {
    await this.verifyPaymentGuarantee(cert);
    const describeValue = (value: unknown): string => {
      if (value === null) return "null";
      if (value === undefined) return "undefined";
      if (Array.isArray(value)) return `array(len=${value.length})`;
      if (typeof value === "object") {
        const keys = Object.keys(value as Record<string, unknown>);
        return `object(keys=${keys.slice(0, 6).join(",")}${keys.length > 6 ? ",..." : ""})`;
      }
      return typeof value;
    };
    if (DEBUG_CERTS) {
      const preview =
        typeof cert.signature === "string" ? cert.signature.slice(0, 12) : "";
      console.log(
        `  debug remunerate: signature=${describeValue(cert.signature)} ${preview}`,
      );
    }
    if (typeof cert.claims !== "string") {
      throw new VerificationError(
        `certificate.claims must be a hex string, got ${describeValue(cert.claims)}`,
      );
    }
    if (typeof cert.signature !== "string") {
      throw new VerificationError(
        `certificate.signature must be a hex string, got ${describeValue(cert.signature)}`,
      );
    }
    const sigWords = await signatureToWordsAsync(cert.signature);
    const claimsBytes = Buffer.from(cert.claims.replace(/^0x/, ""), "hex");
    if (waitOptions) {
      return this.client.gateway.remunerate(claimsBytes, sigWords, waitOptions);
    }
    return this.client.gateway.remunerate(claimsBytes, sigWords);
  }

  /** List all tabs for this recipient that have been settled on-chain. */
  async listSettledTabs(): Promise<TabInfo[]> {
    const tabs = await this.client.rpc.listSettledTabs(this.recipientAddress);
    return tabs.map((t) => TabInfo.fromRpc(t));
  }

  /** List all tabs with outstanding (un-remunerated) guarantees for this recipient. */
  async listPendingRemunerations(): Promise<PendingRemunerationInfo[]> {
    const items = await this.client.rpc.listPendingRemunerations(
      this.recipientAddress,
    );
    return items.map((item) => PendingRemunerationInfo.fromRpc(item));
  }

  /**
   * Fetch a single tab by ID.
   *
   * @param tabId - Tab identifier.
   * @returns The tab, or `null` if not found.
   */
  async getTab(tabId: number | bigint): Promise<TabInfo | null> {
    const result = await this.client.rpc.getTab(tabId);
    return result ? TabInfo.fromRpc(result) : null;
  }

  /**
   * List all tabs belonging to this recipient.
   *
   * @param settlementStatuses - Optional filter on settlement status (e.g. `['PENDING']`).
   */
  async listRecipientTabs(settlementStatuses?: string[]): Promise<TabInfo[]> {
    const tabs = await this.client.rpc.listRecipientTabs(
      this.recipientAddress,
      settlementStatuses,
    );
    return tabs.map((t) => TabInfo.fromRpc(t));
  }

  /**
   * List all guarantee requests associated with a tab.
   *
   * @param tabId - Tab identifier.
   */
  async getTabGuarantees(tabId: number | bigint): Promise<GuaranteeInfo[]> {
    const guarantees = await this.client.rpc.getTabGuarantees(tabId);
    return guarantees.map((g) => GuaranteeInfo.fromRpc(g));
  }

  /**
   * Fetch the most recent guarantee for a tab.
   *
   * @param tabId - Tab identifier.
   * @returns The latest {@link GuaranteeInfo}, or `null` if none exists.
   */
  async getLatestGuarantee(
    tabId: number | bigint,
  ): Promise<GuaranteeInfo | null> {
    const result = await this.client.rpc.getLatestGuarantee(tabId);
    return result ? GuaranteeInfo.fromRpc(result) : null;
  }

  /**
   * Fetch a specific guarantee by tab ID and request ID.
   *
   * @param tabId - Tab identifier.
   * @param reqId - Guarantee request identifier.
   * @returns The {@link GuaranteeInfo}, or `null` if not found.
   */
  async getGuarantee(
    tabId: number | bigint,
    reqId: number | bigint,
  ): Promise<GuaranteeInfo | null> {
    const result = await this.client.rpc.getGuarantee(tabId, reqId);
    return result ? GuaranteeInfo.fromRpc(result) : null;
  }

  /** List all on-chain payments received by this recipient. */
  async listRecipientPayments(): Promise<RecipientPaymentInfo[]> {
    const payments = await this.client.rpc.listRecipientPayments(
      this.recipientAddress,
    );
    return payments.map((p) => RecipientPaymentInfo.fromRpc(p));
  }

  /**
   * List collateral deposit/withdrawal events associated with a tab.
   *
   * @param tabId - Tab identifier.
   */
  async getCollateralEventsForTab(
    tabId: number | bigint,
  ): Promise<CollateralEventInfo[]> {
    const events = await this.client.rpc.getCollateralEventsForTab(tabId);
    return events.map((ev) => CollateralEventInfo.fromRpc(ev));
  }

  /**
   * Fetch the collateral balance a user has locked for a specific asset.
   *
   * @param userAddress - Address of the payer.
   * @param assetAddress - ERC20 token address, or zero address for ETH.
   * @returns Balance info, or `null` if no record exists.
   */
  async getUserAssetBalance(
    userAddress: string,
    assetAddress: string,
  ): Promise<AssetBalanceInfo | null> {
    const balance = await this.client.rpc.getUserAssetBalance(
      userAddress,
      assetAddress,
    );
    return balance ? AssetBalanceInfo.fromRpc(balance) : null;
  }
}
