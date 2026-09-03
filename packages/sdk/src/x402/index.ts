/**
 * The 402 → signed-claim → settle flow for the `4mica-credit` scheme.
 *
 * There is no tab step any more: a claim carries a random 32-byte `req_id`,
 * core binds the guarantee to the open settlement cycle at issuance, and the
 * facilitator's `/settle` turns the signed claim into a BLS certificate.
 */

import { X402Error } from "@/errors";
import {
  PaymentGuaranteeRequestClaims,
  type PaymentSignature,
  SigningScheme,
} from "@/models";
import type { FetchFn } from "@/rpc";
import { isRecord } from "@/serde";
import { utf8ToBase64 } from "@/server/base64";
import {
  normalizeAddress,
  parseU256,
  randomU256,
  ValidationError,
  validateUrl,
} from "@/utils";
import {
  type PaymentRequirements,
  PaymentRequirementsV1,
  PaymentRequirementsV2,
  SCHEME_4MICA_CREDIT,
  SettlementReceipt,
  validationFromExtra,
  type X402PaymentEnvelope,
  type X402PaymentEnvelopeV1,
  type X402PaymentEnvelopeV2,
  type X402PaymentPayload,
  type X402PaymentRequired,
  type X402SettledPayment,
  type X402SignedPayment,
} from "@/x402/models";

export * from "@/x402/models";

/**
 * Minimal signing interface required by {@link X402Flow}.
 * Implemented by the SDK {@link Client}.
 */
export interface FlowSigner {
  signPayment(
    claims: PaymentGuaranteeRequestClaims,
    scheme: SigningScheme,
  ): Promise<PaymentSignature>;
}

/**
 * Handles the x402 HTTP 402 payment protocol for 4Mica.
 *
 * Builds and signs payment claims with a random `reqId` (no server
 * round-trip), and optionally settles the payment against a facilitator
 * service.
 *
 * @example
 * ```ts
 * const flow = X402Flow.fromClient(client);
 * const signed = await flow.signPayment(paymentRequirements, userAddress);
 * // attach signed.header as the X-PAYMENT request header
 * ```
 */
export class X402Flow {
  private fetchFn: FetchFn;

  /**
   * @param signer - Payment signer, typically the SDK `Client`.
   * @param fetchFn - HTTP fetch implementation. Defaults to global `fetch`.
   */
  constructor(
    private signer: FlowSigner,
    fetchFn: FetchFn = fetch,
  ) {
    this.fetchFn = fetchFn;
  }

  /** Convenience factory — creates an `X402Flow` from a `Client`. */
  static fromClient(client: FlowSigner): X402Flow {
    return new X402Flow(client);
  }

  /**
   * Build a signed payment envelope for x402 version 1. The base64 `header`
   * goes in `X-PAYMENT`.
   */
  async signPayment(
    paymentRequirements: PaymentRequirementsV1 | Record<string, unknown>,
    userAddress: string,
  ): Promise<X402SignedPayment> {
    const requirements =
      paymentRequirements instanceof PaymentRequirementsV1
        ? paymentRequirements
        : PaymentRequirementsV1.fromRaw(paymentRequirements);
    X402Flow.validateScheme(requirements.scheme);

    const claims = this.buildClaims(requirements, userAddress);
    const signature = await this.sign(claims);
    const paymentPayload = buildPaymentPayload(claims, signature);
    const envelope: X402PaymentEnvelopeV1 = {
      x402Version: 1,
      scheme: requirements.scheme,
      network: requirements.network,
      payload: paymentPayload,
    };
    return finish(1, envelope, paymentPayload, signature);
  }

  /**
   * Build a signed payment envelope for x402 version 2. The base64 `header`
   * goes in `PAYMENT-SIGNATURE`.
   */
  async signPaymentV2(
    paymentRequired: X402PaymentRequired,
    accepted: PaymentRequirementsV2 | Record<string, unknown>,
    userAddress: string,
  ): Promise<X402SignedPayment> {
    const requirements =
      accepted instanceof PaymentRequirementsV2
        ? accepted
        : PaymentRequirementsV2.fromRaw(accepted);
    X402Flow.validateScheme(requirements.scheme);
    if (paymentRequired.x402Version !== 2) {
      throw new X402Error("expected x402 version 2");
    }

    const claims = this.buildClaims(requirements, userAddress);
    const signature = await this.sign(claims);
    const paymentPayload = buildPaymentPayload(claims, signature);
    const envelope: X402PaymentEnvelopeV2 = {
      x402Version: 2,
      accepted: requirements.toPayload(),
      payload: paymentPayload,
      resource: paymentRequired.resource.toPayload(),
    };
    // Spec v2 §5.1.2: return at least the info the server advertised.
    if (paymentRequired.extensions !== undefined) {
      envelope.extensions = paymentRequired.extensions;
    }
    return finish(2, envelope, paymentPayload, signature);
  }

  /**
   * Settle a previously signed payment through the facilitator's `/settle`
   * endpoint. `paymentPayload` is the envelope object, not the base64 header.
   *
   * Failures arrive as HTTP 200 with `success: false` — inspect the returned
   * {@link SettlementReceipt}, not just the absence of an exception.
   */
  async settlePayment(
    payment: X402SignedPayment,
    paymentRequirements: PaymentRequirements | Record<string, unknown>,
    facilitatorUrl: string,
  ): Promise<X402SettledPayment> {
    const requirements = coerceRequirements(paymentRequirements);
    const requirementsVersion =
      requirements instanceof PaymentRequirementsV1 ? 1 : 2;
    if (requirementsVersion !== payment.x402Version) {
      throw new X402Error(
        `payment is x402 v${payment.x402Version}, but requirements are ` +
          `x402 v${requirementsVersion}`,
      );
    }
    try {
      validateUrl(facilitatorUrl);
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new X402Error(`invalid facilitator url: ${err.message}`);
      }
      throw err;
    }

    const url = `${facilitatorUrl.replace(/\/+$/, "")}/settle`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          x402Version: payment.x402Version,
          paymentPayload: payment.envelope,
          paymentRequirements: requirements.toPayload(),
        }),
      });
    } catch (err) {
      throw new X402Error(err instanceof Error ? err.message : String(err));
    }
    const text = await response.text();
    let settlement: unknown;
    try {
      settlement = text ? JSON.parse(text) : {};
    } catch (err) {
      throw new X402Error(`settlement response invalid JSON: ${String(err)}`);
    }
    if (!response.ok) {
      throw new X402Error(
        `settlement failed with status ${response.status}: ${text}`,
      );
    }
    return { payment, settlement: SettlementReceipt.fromRaw(settlement) };
  }

  private async sign(
    claims: PaymentGuaranteeRequestClaims,
  ): Promise<PaymentSignature> {
    try {
      return await this.signer.signPayment(claims, SigningScheme.EIP712);
    } catch (err) {
      if (err instanceof X402Error) throw err;
      throw new X402Error(
        `failed to sign payment: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  protected buildClaims(
    requirements: PaymentRequirements,
    userAddress: string,
  ): PaymentGuaranteeRequestClaims {
    let amount: bigint;
    try {
      amount = parseU256(requirements.amount);
    } catch (err) {
      throw new X402Error(`invalid amount: ${String(err)}`);
    }
    // A random reqId: uniqueness is all core asks of it now that requests no
    // longer count up a tab.
    const reqId = randomU256();
    let claims: PaymentGuaranteeRequestClaims;
    try {
      claims = PaymentGuaranteeRequestClaims.new(
        normalizeAddress(userAddress),
        normalizeAddress(requirements.payTo),
        reqId,
        amount,
        Math.floor(Date.now() / 1000),
        requirements.asset,
      );
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new X402Error(err.message);
      }
      throw err;
    }

    const validation = validationFromExtra(requirements.extra);
    return validation === undefined
      ? claims
      : claims.withValidation(validation);
  }

  private static validateScheme(scheme: string): void {
    if (scheme !== SCHEME_4MICA_CREDIT) {
      throw new X402Error(`invalid scheme: ${scheme}`);
    }
  }
}

function coerceRequirements(
  requirements: PaymentRequirements | Record<string, unknown>,
): PaymentRequirements {
  if (
    requirements instanceof PaymentRequirementsV1 ||
    requirements instanceof PaymentRequirementsV2
  ) {
    return requirements;
  }
  if (!isRecord(requirements)) {
    throw new X402Error("invalid payment requirements");
  }
  return "maxAmountRequired" in requirements
    ? PaymentRequirementsV1.fromRaw(requirements)
    : PaymentRequirementsV2.fromRaw(requirements);
}

/** Assemble the wire payload for a signed claim. */
export function buildPaymentPayload(
  claims: PaymentGuaranteeRequestClaims,
  signature: PaymentSignature,
): X402PaymentPayload {
  return {
    claims: claims.toPayload(),
    signature: signature.signature,
    scheme: signature.scheme,
  };
}

function finish(
  x402Version: number,
  envelope: X402PaymentEnvelope,
  payload: X402PaymentPayload,
  signature: PaymentSignature,
): X402SignedPayment {
  const header = utf8ToBase64(JSON.stringify(envelope));
  return { header, envelope, x402Version, payload, signature };
}
