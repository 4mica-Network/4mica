/** Payer-side request signing. */

import type { Account } from "viem";
import { eip191PayloadForClaims, guaranteeTypedData } from "@/digest";
import { AddressMismatchError, SigningError } from "@/errors";
import {
  type CorePublicParameters,
  type PaymentGuaranteeRequestClaims,
  type PaymentSignature,
  SigningScheme,
} from "@/models";
import { normalizeAddress, ValidationError } from "@/utils";

export type {
  GuaranteeClaimsMessage,
  GuaranteeEip712Domain,
  GuaranteeTypedData,
} from "@/digest";
export {
  eip191PayloadForClaims,
  encodeTypeString,
  GUARANTEE_CLAIMS_V1_TYPE,
  GUARANTEE_EIP712_DOMAIN_TYPE,
  GUARANTEE_VALIDATION_TYPE,
  guaranteeTypedData,
  VALIDATED_GUARANTEE_CLAIMS_V1_TYPE,
} from "@/digest";

/**
 * Signs payment guarantee requests using EIP-712 or EIP-191.
 *
 * Refuses to sign claims naming anyone but its own signer as the payer.
 */
export class PaymentSigner {
  readonly signer: Account;

  constructor(signer: Account) {
    this.signer = signer;
  }

  get address(): string {
    return this.signer.address;
  }

  async signRequest(
    params: CorePublicParameters,
    claims: PaymentGuaranteeRequestClaims,
    scheme: SigningScheme = SigningScheme.EIP712,
  ): Promise<PaymentSignature> {
    if (
      normalizeAddress(this.signer.address) !==
      normalizeAddress(claims.userAddress)
    ) {
      throw new AddressMismatchError(this.signer.address, claims.userAddress);
    }

    try {
      if (scheme === SigningScheme.EIP712) {
        if (!this.signer.signTypedData) {
          throw new SigningError(
            "signTypedData is not supported for this account",
          );
        }
        const typed = guaranteeTypedData(params, claims);
        // The union of the two struct layouts defeats viem's typed-data
        // generics; the digest-vector tests pin the actual bytes.
        const signature = await this.signer.signTypedData(
          typed as unknown as Parameters<
            NonNullable<Account["signTypedData"]>
          >[0],
        );
        return { signature, scheme };
      }

      if (scheme === SigningScheme.EIP191) {
        if (!this.signer.signMessage) {
          throw new SigningError(
            "signMessage is not supported for this account",
          );
        }
        // The message is the raw ABI encoding, not its hex spelling.
        const payload = eip191PayloadForClaims(claims);
        const signature = await this.signer.signMessage({
          message: { raw: payload },
        });
        return { signature, scheme };
      }

      throw new SigningError(`unsupported signing scheme: ${scheme}`);
    } catch (err: unknown) {
      if (err instanceof AddressMismatchError || err instanceof SigningError) {
        throw err;
      }
      if (err instanceof ValidationError) {
        throw new SigningError(err.message);
      }
      throw new SigningError(err instanceof Error ? err.message : String(err));
    }
  }
}
