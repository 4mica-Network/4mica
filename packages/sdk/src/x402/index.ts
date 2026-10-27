/**
 * The 402 → signed-payment → settle flow for the `4mica-credit` scheme.
 *
 * A payment is scoped to the asset's live settlement cycle, carries a random
 * 32-byte `req_id` and a salted commitment to the recipient, and is signed
 * under the ClearingHouse domain. The facilitator's `/settle` redeems it for
 * the operator's guarantee receipt.
 */

import { Asset } from "@/client/model";
import { X402Error } from "@/errors";
import type { PaymentRequest, PaymentRequestPayload } from "@/models";
import type { FetchFn } from "@/rpc";
import { isRecord } from "@/serde";
import { utf8ToBase64 } from "@/server/base64";
import {
  normalizeAddress,
  parseU256,
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
  type X402PaymentRequired,
  type X402SettledPayment,
  type X402SignedPayment,
} from "@/x402/models";

export * from "@/x402/models";

/**
 * What {@link X402Flow} needs of a payer: a payload scoped to the live
 * settlement cycle, and a signature over it. Implemented by the SDK
 * {@link Client}.
 */
export interface FlowSigner {
  newPayment(
    recipient: string,
    amount: bigint,
    asset: Asset,
  ): Promise<PaymentRequestPayload>;
  signPayment(payload: PaymentRequestPayload): Promise<PaymentRequest>;
}

/**
 * Handles the x402 HTTP 402 payment protocol for 4Mica.
 *
 * Builds a payment for the live settlement cycle, signs it, and optionally
 * settles it against a facilitator service.
 *
 * @example
 * ```ts
 * const flow = X402Flow.fromClient(client);
 * const signed = await flow.signPayment(paymentRequirements);
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
  ): Promise<X402SignedPayment> {
    const requirements =
      paymentRequirements instanceof PaymentRequirementsV1
        ? paymentRequirements
        : PaymentRequirementsV1.fromRaw(paymentRequirements);
    X402Flow.validateScheme(requirements.scheme);

    const request = await this.sign(await this.buildPayment(requirements));
    const envelope: X402PaymentEnvelopeV1 = {
      x402Version: 1,
      scheme: requirements.scheme,
      network: requirements.network,
      payload: request.toPayload(),
    };
    return finish(1, envelope, request);
  }

  /**
   * Build a signed payment envelope for x402 version 2. The base64 `header`
   * goes in `PAYMENT-SIGNATURE`.
   */
  async signPaymentV2(
    paymentRequired: X402PaymentRequired,
    accepted: PaymentRequirementsV2 | Record<string, unknown>,
  ): Promise<X402SignedPayment> {
    const requirements =
      accepted instanceof PaymentRequirementsV2
        ? accepted
        : PaymentRequirementsV2.fromRaw(accepted);
    X402Flow.validateScheme(requirements.scheme);
    if (paymentRequired.x402Version !== 2) {
      throw new X402Error("expected x402 version 2");
    }

    const request = await this.sign(await this.buildPayment(requirements));
    const envelope: X402PaymentEnvelopeV2 = {
      x402Version: 2,
      accepted: requirements.toPayload(),
      payload: request.toPayload(),
      resource: paymentRequired.resource.toPayload(),
    };
    // Spec v2 §5.1.2: return at least the info the server advertised.
    if (paymentRequired.extensions !== undefined) {
      envelope.extensions = paymentRequired.extensions;
    }
    return finish(2, envelope, request);
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
    // Called as a free function: a browser's `window.fetch` throws
    // "Illegal invocation" when invoked with any other receiver.
    const fetchFn = this.fetchFn;
    let response: Response;
    try {
      response = await fetchFn(url, {
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
    // Before parsing: a request the facilitator cannot read is answered in
    // plain text, and its status says more than a JSON parse error would.
    if (!response.ok) {
      throw new X402Error(
        `settlement failed with status ${response.status}: ${text}`,
      );
    }
    let settlement: unknown;
    try {
      settlement = text ? JSON.parse(text) : {};
    } catch (err) {
      throw new X402Error(`settlement response invalid JSON: ${String(err)}`);
    }
    return { payment, settlement: SettlementReceipt.fromRaw(settlement) };
  }

  private async sign(payload: PaymentRequestPayload): Promise<PaymentRequest> {
    try {
      return await this.signer.signPayment(payload);
    } catch (err) {
      if (err instanceof X402Error) throw err;
      throw new X402Error(
        `failed to sign payment: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** The payment these requirements ask for, scoped to the live settlement cycle. */
  protected async buildPayment(
    requirements: PaymentRequirements,
  ): Promise<PaymentRequestPayload> {
    let recipient: string;
    let amount: bigint;
    let asset: Asset;
    try {
      recipient = normalizeAddress(requirements.payTo.trim());
      amount = parseU256(requirements.amount);
      asset = Asset.coerce(normalizeAddress(requirements.asset.trim()));
    } catch (err) {
      throw new X402Error(
        `invalid payment requirements: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const validation = validationFromExtra(requirements.extra);

    let payload: PaymentRequestPayload;
    try {
      payload = await this.signer.newPayment(recipient, amount, asset);
    } catch (err) {
      if (err instanceof X402Error) throw err;
      throw new X402Error(
        `failed to build payment: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // Echo the advertised spelling of the recipient rather than a re-encoded
    // one, so a resource server that compares it as a string still matches.
    // What the payer commits to is the address either way.
    try {
      payload = payload.with({ recipientAddress: requirements.payTo.trim() });
      return validation === undefined
        ? payload
        : payload.withValidation(validation);
    } catch (err) {
      if (err instanceof ValidationError) throw new X402Error(err.message);
      throw err;
    }
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

function finish(
  x402Version: number,
  envelope: X402PaymentEnvelope,
  request: PaymentRequest,
): X402SignedPayment {
  const header = utf8ToBase64(JSON.stringify(envelope));
  return {
    header,
    envelope,
    x402Version,
    payload: request.toPayload(),
    request,
  };
}
