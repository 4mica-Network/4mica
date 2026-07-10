import type { Hex } from "viem";
import type { Client } from "@/client/index";
import type { TxReceiptWaitOptions } from "@/contract";
import { VerificationError } from "@/errors";
import { decodeGuaranteeClaims } from "@/guarantee";
import {
  AssetBalanceInfo,
  type BLSCert,
  ClearingParticipantProof,
  ClearingSettlementActionResponse,
  type PaymentGuaranteeClaims,
  type PaymentGuaranteeRequestClaims,
  type PaymentGuaranteeRequestClaimsV2,
  RecipientPaymentInfo,
  type SigningScheme,
} from "@/models";
import { buildPaymentPayload } from "@/payment";
import { ensureHexPrefix, normalizeAddress } from "@/utils";

/**
 * Recipient-side operations: guarantee issuance/verification and cycle-based
 * clearing settlement.
 */
export class RecipientClient {
  constructor(private client: Client) {}

  private get recipientAddress(): string {
    return normalizeAddress(this.client.signer.signer.address);
  }

  get guaranteeDomain(): string {
    return this.client.guaranteeDomain;
  }

  /**
   * Issue a BLS-signed payment guarantee certificate via the core RPC.
   *
   * The returned {@link BLSCert} can be stored and later settled via the
   * cycle-clearing flow ({@link claimNetCredit}).
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
   * Fetch this recipient's committed position + Merkle proof for a cycle.
   *
   * @param cycleId - On-chain `bytes32` cycle identifier.
   */
  async getClearingParticipantProof(
    cycleId: string,
  ): Promise<ClearingParticipantProof> {
    const raw = await this.client.rpc.getClearingParticipantProof(
      cycleId,
      this.recipientAddress,
    );
    return ClearingParticipantProof.fromRpc(raw);
  }

  /**
   * Fetch the prepared `claimNetCredit` action for this recipient in a cycle.
   *
   * @param cycleId - On-chain `bytes32` cycle identifier.
   */
  async getClearingClaimNetCreditAction(
    cycleId: string,
  ): Promise<ClearingSettlementActionResponse> {
    const raw = await this.client.rpc.getClearingClaimNetCreditAction(
      cycleId,
      this.recipientAddress,
    );
    return ClearingSettlementActionResponse.fromRpc(raw);
  }

  /**
   * Claim this recipient's committed net credit for a settlement cycle on-chain.
   *
   * Fetches the prepared clearing action (contract address, amount, and Merkle
   * proof) from core, then submits `claimNetCredit` to the ClearingHouse.
   *
   * @param cycleId - On-chain `bytes32` cycle identifier.
   * @param waitOptions - Optional timeout/polling overrides for receipt polling.
   * @throws {@link ContractError} if the contract call fails.
   */
  async claimNetCredit(cycleId: string, waitOptions?: TxReceiptWaitOptions) {
    const action = await this.getClearingClaimNetCreditAction(cycleId);
    return this.client.gateway.claimNetCredit(
      action.contractAddress,
      ensureHexPrefix(action.cycleId) as Hex,
      action.amount,
      action.proof.map((p) => ensureHexPrefix(p) as Hex),
      waitOptions,
    );
  }

  /** List all on-chain payments received by this recipient. */
  async listRecipientPayments(): Promise<RecipientPaymentInfo[]> {
    const payments = await this.client.rpc.listRecipientPayments(
      this.recipientAddress,
    );
    return payments.map((p) => RecipientPaymentInfo.fromRpc(p));
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
