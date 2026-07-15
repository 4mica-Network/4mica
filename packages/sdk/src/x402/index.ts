import { X402Error } from "@/errors";
import {
  PaymentGuaranteeRequestClaims,
  PaymentGuaranteeRequestClaimsV2,
  type PaymentSignature,
  SigningScheme,
} from "@/models";
import { buildPaymentPayload } from "@/payment";
import type { FetchFn } from "@/rpc";
import { parsePaymentHeader } from "@/server/envelope";
import { normalizeAddress, parseU256 } from "@/utils";
import {
  computeValidationRequestHash,
  computeValidationSubjectHash,
} from "@/validation";
import type {
  PaymentRequirementsExtra,
  PaymentRequirementsV1,
  PaymentRequirementsV2,
  X402PaymentEnvelopeV1,
  X402PaymentEnvelopeV2,
  X402PaymentRequired,
  X402SettledPayment,
  X402SignedPayment,
} from "@/x402/models";

export * from "@/x402/models";

type ValidationPolicyExtra = Required<
  Pick<
    PaymentRequirementsExtra,
    | "validationRegistryAddress"
    | "validationChainId"
    | "validatorAddress"
    | "validatorAgentId"
    | "minValidationScore"
    | "jobHash"
  >
> &
  PaymentRequirementsExtra;

function hasValidationPolicy(
  extra: PaymentRequirementsExtra | undefined,
): extra is ValidationPolicyExtra {
  return !!(
    extra?.validationRegistryAddress &&
    extra?.validatorAddress &&
    extra?.validatorAgentId !== undefined &&
    extra?.minValidationScore !== undefined &&
    extra?.validationChainId !== undefined &&
    extra?.jobHash
  );
}

/**
 * Minimal signing interface required by {@link X402Flow}.
 * Implemented by {@link UserClient} from the main SDK client.
 */
export interface FlowSigner {
  signPayment(
    claims: PaymentGuaranteeRequestClaims | PaymentGuaranteeRequestClaimsV2,
    scheme: SigningScheme,
  ): Promise<PaymentSignature>;
}

/**
 * Handles the x402 HTTP 402 payment protocol for 4Mica.
 *
 * Orchestrates the full client-side x402 flow: building and signing payment claims
 * (V1 or V2) using the request id advertised in `extra.reqId`, and optionally settling
 * the payment against a facilitator service.
 *
 * @example
 * ```ts
 * const flow = X402Flow.fromClient(client);
 * const signed = await flow.signPayment(paymentRequirements, userAddress);
 * // attach signed.header as the X-PAYMENT header on the protected request
 * ```
 */
export class X402Flow {
  private fetchFn: FetchFn;

  /**
   * @param signer - Payment signer, typically `client.user`.
   * @param fetchFn - HTTP fetch implementation. Defaults to global `fetch`.
   */
  constructor(
    private signer: FlowSigner,
    fetchFn: FetchFn = fetch,
  ) {
    this.fetchFn = fetchFn;
  }

  /**
   * Convenience factory — creates an `X402Flow` from the user sub-client of a `Client`.
   *
   * @param client - Any object with a `.user` property implementing {@link FlowSigner}.
   */
  static fromClient(client: { user: FlowSigner }): X402Flow {
    return new X402Flow(client.user);
  }

  /**
   * Sign an x402 V1 payment.
   *
   * Builds V1 claims from `paymentRequirements` (request id sourced from
   * `extra.reqId`), signs them with EIP-712, and returns the base64-encoded payment
   * header together with the raw payload and signature.
   *
   * @param paymentRequirements - V1 payment requirements from the `402 Payment Required` response.
   * @param userAddress - Address of the paying user.
   * @returns Signed payment ready to attach as the `X-PAYMENT` request header.
   * @throws {@link X402Error} if the scheme is not a 4Mica scheme.
   */
  async signPayment(
    paymentRequirements: PaymentRequirementsV1,
    userAddress: string,
  ): Promise<X402SignedPayment> {
    X402Flow.validateScheme(paymentRequirements.scheme);

    const claims = this.buildClaims(paymentRequirements, userAddress);
    const signature = await this.signer.signPayment(
      claims,
      SigningScheme.EIP712,
    );
    const paymentPayload = buildPaymentPayload(claims, signature);

    const envelope: X402PaymentEnvelopeV1 = {
      x402Version: 1,
      scheme: paymentRequirements.scheme,
      network: paymentRequirements.network,
      payload: paymentPayload,
    };
    const header = Buffer.from(JSON.stringify(envelope)).toString("base64");
    return { header, payload: paymentPayload, signature };
  }

  /**
   * Sign an x402 V2 payment, optionally including a V2 validation policy.
   *
   * If `accepted.extra` contains all required validation policy fields
   * (`validationRegistryAddress`, `validatorAddress`, `validatorAgentId`,
   * `minValidationScore`, `validationChainId`, `jobHash`), the claims are built as V2 with
   * the computed `validationSubjectHash` and `validationRequestHash`. Otherwise
   * falls back to V1 claims.
   *
   * @param paymentRequired - The original `402 Payment Required` response object.
   * @param accepted - The accepted V2 payment requirements.
   * @param userAddress - Address of the paying user.
   * @returns Signed payment ready to attach as the `X-PAYMENT` request header.
   * @throws {@link X402Error} if the scheme is not a 4Mica scheme.
   */
  async signPaymentV2(
    paymentRequired: X402PaymentRequired,
    accepted: PaymentRequirementsV2,
    userAddress: string,
  ): Promise<X402SignedPayment> {
    X402Flow.validateScheme(accepted.scheme);
    const isV2Claims = hasValidationPolicy(accepted.extra);

    const claims = isV2Claims
      ? this.buildClaimsV2(accepted, userAddress)
      : this.buildClaims(accepted, userAddress);

    const signature = await this.signer.signPayment(
      claims,
      SigningScheme.EIP712,
    );
    const paymentPayload = buildPaymentPayload(claims, signature);

    const envelope: X402PaymentEnvelopeV2 = {
      x402Version: 2,
      accepted: accepted,
      payload: paymentPayload,
      resource: paymentRequired.resource,
    };
    const header = Buffer.from(JSON.stringify(envelope)).toString("base64");
    return { header, payload: paymentPayload, signature };
  }

  /**
   * Submit a signed payment to a facilitator for on-chain settlement.
   *
   * Sends a POST request to `{facilitatorUrl}/settle` with the payment header,
   * decoded payload, and payment requirements. Use this when the protected resource
   * requires facilitator-confirmed settlement before granting access.
   *
   * @param payment - Signed payment returned by {@link signPayment} or {@link signPaymentV2}.
   * @param paymentRequirements - V1 payment requirements included in the settlement request.
   * @param facilitatorUrl - Base URL of the facilitator service.
   * @returns The original payment plus the raw settlement response from the facilitator.
   * @throws {@link X402Error} if the facilitator returns a non-2xx response.
   */
  async settlePayment(
    payment: X402SignedPayment,
    paymentRequirements: PaymentRequirementsV1,
    facilitatorUrl: string,
  ): Promise<X402SettledPayment> {
    const url = `${facilitatorUrl.replace(/\/$/, "")}/settle`;
    const paymentPayload = X402Flow.decodePaymentHeader(payment.header);
    const x402Version =
      typeof paymentPayload === "object" &&
      paymentPayload &&
      "x402Version" in paymentPayload
        ? (paymentPayload as { x402Version?: number }).x402Version
        : undefined;
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(x402Version ? { x402Version } : {}),
        paymentHeader: payment.header,
        paymentPayload,
        paymentRequirements,
      }),
    });
    const data = await response.text();
    if (!response.ok) {
      throw new X402Error(
        `settlement failed with status ${response.status}: ${data}`,
      );
    }
    const settlement = data ? JSON.parse(data) : {};
    return { payment, settlement };
  }

  protected buildClaims(
    requirements: PaymentRequirementsV1 | PaymentRequirementsV2,
    userAddress: string,
  ): PaymentGuaranteeRequestClaims {
    const reqId =
      requirements.extra?.reqId !== undefined &&
      requirements.extra?.reqId !== null
        ? parseU256(requirements.extra.reqId)
        : 0n;
    const amount = parseU256(
      "maxAmountRequired" in requirements
        ? requirements.maxAmountRequired
        : requirements.amount,
    );
    const timestamp = Math.floor(Date.now() / 1000);
    return PaymentGuaranteeRequestClaims.new(
      userAddress,
      normalizeAddress(requirements.payTo),
      amount,
      timestamp,
      requirements.asset,
      reqId,
    );
  }

  protected buildClaimsV2(
    requirements: PaymentRequirementsV2,
    userAddress: string,
  ): PaymentGuaranteeRequestClaimsV2 {
    const base = this.buildClaims(requirements, userAddress);
    const extra = requirements.extra!;

    const validationSubjectHash = computeValidationSubjectHash(base);

    const partialClaims = new PaymentGuaranteeRequestClaimsV2({
      userAddress: base.userAddress,
      recipientAddress: base.recipientAddress,
      reqId: base.reqId,
      amount: base.amount,
      timestamp: base.timestamp,
      assetAddress: base.assetAddress,
      validationRegistryAddress: extra.validationRegistryAddress!,
      validationRequestHash: "0x" + "00".repeat(32),
      validationChainId: extra.validationChainId!,
      validatorAddress: extra.validatorAddress!,
      validatorAgentId: parseU256(extra.validatorAgentId!),
      minValidationScore: extra.minValidationScore!,
      validationSubjectHash,
      jobHash: extra.jobHash!,
      requiredValidationTag: extra.requiredValidationTag ?? "",
    });

    const validationRequestHash = computeValidationRequestHash(partialClaims);

    return new PaymentGuaranteeRequestClaimsV2({
      ...partialClaims,
      validationRequestHash,
    });
  }

  private static validateScheme(scheme: string): void {
    if (!scheme.toLowerCase().includes("4mica")) {
      throw new X402Error(`invalid scheme: ${scheme}`);
    }
  }

  private static decodePaymentHeader(
    header: string,
  ): X402PaymentEnvelopeV1 | X402PaymentEnvelopeV2 {
    // Shared, edge-safe decoder (no Buffer) — see ../server/envelope.
    return parsePaymentHeader(header);
  }

  // payment payload construction is centralized in ../payment
}
