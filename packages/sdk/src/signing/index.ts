/** Payer-side signing: the payloads a payer authorizes under the ClearingHouse domain. */

import type { Account } from "viem";
import {
  AddressMismatchError,
  InvalidParamsError,
  InvalidPayerAddressError,
  SigningError,
} from "@/errors";
import {
  checkpointTypedData,
  type FourMicaEip712Domain,
  paymentAuthorizationTypedData,
} from "@/guarantee";
import {
  type CheckpointPayload,
  PaymentRequest,
  type PaymentRequestPayload,
  SignedCheckpoint,
} from "@/models";
import { normalizeAddress, ValidationError } from "@/utils";

/**
 * Signs the payloads a payer authorizes — payment requests and checkpoints —
 * under the ClearingHouse domain. Both are signed as EIP-712 typed data, so
 * a local, JSON-RPC or browser-wallet account all work.
 *
 * Refuses to sign for any payer but its own signer.
 */
export class PayerSigner {
  readonly signer: Account;

  constructor(signer: Account) {
    this.signer = signer;
  }

  get address(): string {
    return this.signer.address;
  }

  async signPaymentRequest(
    domain: FourMicaEip712Domain,
    payload: PaymentRequestPayload,
  ): Promise<PaymentRequest> {
    this.requireSignerIs(payload.userAddress);
    const signature = await this.signTypedData(() =>
      paymentAuthorizationTypedData(domain, payload),
    );
    return new PaymentRequest(payload, signature);
  }

  async signCheckpoint(
    domain: FourMicaEip712Domain,
    payload: CheckpointPayload,
  ): Promise<SignedCheckpoint> {
    this.requireSignerIs(payload.payer);
    const signature = await this.signTypedData(() =>
      checkpointTypedData(domain, payload),
    );
    return new SignedCheckpoint(payload, signature);
  }

  private requireSignerIs(payer: string): void {
    let expected: string;
    try {
      expected = normalizeAddress(payer);
    } catch {
      throw new InvalidPayerAddressError();
    }
    const signer = normalizeAddress(this.signer.address);
    if (signer !== expected) {
      throw new AddressMismatchError(signer, expected);
    }
  }

  private async signTypedData(
    build: () => Parameters<NonNullable<Account["signTypedData"]>>[0],
  ): Promise<string> {
    if (!this.signer.signTypedData) {
      throw new SigningError("signTypedData is not supported for this account");
    }
    let typedData: Parameters<NonNullable<Account["signTypedData"]>>[0];
    try {
      typedData = build();
    } catch (err) {
      if (err instanceof InvalidParamsError || err instanceof ValidationError) {
        throw new SigningError(`failed to sign the payment: ${err.message}`);
      }
      throw err;
    }
    try {
      return await this.signer.signTypedData(typedData);
    } catch (err) {
      throw new SigningError(
        `failed to sign the payment: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
