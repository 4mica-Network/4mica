/**
 * Payment guarantees: the payer signs a request, the recipient turns it into
 * a certificate and checks it. Both roles live here since they exchange the
 * same claims.
 */

import { verifyBlsSignature } from "@/bls";
import type { ClientCtx } from "@/client/ctx";
import {
  CertificateMismatchError,
  GuaranteeDomainMismatchError,
  InvalidCertificateError,
  InvalidParamsError,
  UnsupportedGuaranteeVersionError,
  VerificationError,
} from "@/errors";
import { decodeGuaranteeClaims } from "@/guarantee";
import type {
  BLSCert,
  PaymentGuaranteeClaims,
  PaymentGuaranteeRequestClaims,
  PaymentSignature,
  RecipientPaymentInfo,
} from "@/models";
import { SigningScheme } from "@/models";

export class PaymentClient {
  constructor(private ctx: ClientCtx) {}

  /** The domain separator guarantees are issued under at the current version. */
  get guaranteeDomain(): Uint8Array {
    return this.ctx.guaranteeDomain;
  }

  /** Domain separator per supported guarantee version. */
  get guaranteeDomains(): Map<number, Uint8Array> {
    return new Map(this.ctx.guaranteeDomains);
  }

  /**
   * Sign a guarantee request as the payer. Hand the signature to the
   * recipient, who redeems it with {@link issueGuarantee}.
   */
  async signRequest(
    claims: PaymentGuaranteeRequestClaims,
    scheme: SigningScheme = SigningScheme.EIP712,
  ): Promise<PaymentSignature> {
    return this.ctx.paymentSigner.signRequest(
      this.ctx.publicParams,
      claims,
      scheme,
    );
  }

  /**
   * Redeem a payer's signed request for a certificate guaranteeing the
   * payment, as the recipient. The signer must be the claims' recipient — the
   * certificate credits them.
   */
  async issueGuarantee(
    claims: PaymentGuaranteeRequestClaims,
    signature: PaymentSignature | string,
    scheme: SigningScheme = SigningScheme.EIP712,
  ): Promise<BLSCert> {
    if (
      claims.recipientAddress.toLowerCase() !==
      this.ctx.signerAddress.toLowerCase()
    ) {
      throw new InvalidParamsError(
        `claims recipient ${claims.recipientAddress} is not this signer ` +
          this.ctx.signerAddress,
      );
    }
    const signatureHex =
      typeof signature === "string" ? signature : signature.signature;
    const resolvedScheme =
      typeof signature === "string" ? scheme : signature.scheme;
    return this.ctx.rpc.issueGuarantee({
      claims: claims.toPayload(),
      signature: signatureHex,
      scheme: resolvedScheme,
    });
  }

  /**
   * Check that `cert` was issued by the operator this client trusts,
   * returning the claims it certifies.
   *
   * @throws {@link CertificateMismatchError} if the BLS signature does not verify.
   * @throws {@link GuaranteeDomainMismatchError} on a domain separator mismatch.
   */
  async verifyGuarantee(cert: BLSCert): Promise<PaymentGuaranteeClaims> {
    let claimsBytes: Uint8Array;
    try {
      claimsBytes = cert.claimsBytes();
    } catch (err) {
      throw new InvalidCertificateError(
        err instanceof Error ? err.message : String(err),
      );
    }

    const verified = await verifyBlsSignature(
      this.ctx.operatorPublicKey,
      claimsBytes,
      cert.signature,
    );
    if (!verified) {
      throw new CertificateMismatchError("certificate signature mismatch");
    }

    let claims: PaymentGuaranteeClaims;
    try {
      claims = decodeGuaranteeClaims(claimsBytes);
    } catch (err) {
      if (err instanceof VerificationError) {
        throw new InvalidCertificateError(err.message);
      }
      throw err;
    }

    const expectedDomain = this.ctx.guaranteeDomainForVersion(claims.version);
    if (expectedDomain === undefined) {
      throw new UnsupportedGuaranteeVersionError(claims.version);
    }
    if (
      claims.domain.length !== expectedDomain.length ||
      !claims.domain.every((byte, index) => byte === expectedDomain[index])
    ) {
      throw new GuaranteeDomainMismatchError("guarantee domain mismatch");
    }
    return claims;
  }

  /** Payments guaranteed to the signer as a recipient. */
  async listReceived(): Promise<RecipientPaymentInfo[]> {
    return this.ctx.rpc.listRecipientPayments(this.ctx.signerAddress);
  }
}
