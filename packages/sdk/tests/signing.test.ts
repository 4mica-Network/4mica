import { type Hex, recoverMessageAddress, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { eip191PayloadForClaims, guaranteeTypedData } from "@/digest";
import { AddressMismatchError, SigningError } from "@/errors";
import {
  CorePublicParameters,
  PaymentGuaranteeRequestClaims,
  SigningScheme,
  ValidationRequirement,
} from "@/models";
import { PaymentSigner } from "@/signing";

const PRIVATE_KEY =
  "0x59c6995e998f97a5a0044976f7be35d5ad91c0cfa55b5cfb20b07a1c60f4c5bc" as Hex;

const CONTRACT = "0x00000000000000000000000000000000000000cc";

function buildParams(): CorePublicParameters {
  return new CorePublicParameters(
    new Uint8Array(48),
    CONTRACT,
    "4mica",
    "1",
    1,
  );
}

function buildClaims(userAddress: string): PaymentGuaranteeRequestClaims {
  return PaymentGuaranteeRequestClaims.new(
    userAddress,
    "0x0000000000000000000000000000000000000002",
    123,
    999,
    1700000000,
    null,
  );
}

const validation = () =>
  new ValidationRequirement({
    validator: "eip155:1:0x1111111111111111111111111111111111111111",
    subject: `0x${"42".repeat(32)}`,
    deadline: 1700000600,
    params: "0xdeadbeef",
  });

describe("PaymentSigner", () => {
  it("refuses claims naming a different payer", async () => {
    const signer = new PaymentSigner(
      privateKeyToAccount(`0x${"11".repeat(32)}` as Hex),
    );
    const claims = buildClaims("0x0000000000000000000000000000000000000011");
    await expect(
      signer.signRequest(buildParams(), claims, SigningScheme.EIP712),
    ).rejects.toThrow(AddressMismatchError);
  });

  it("produces a verifiable EIP-712 signature", async () => {
    const account = privateKeyToAccount(PRIVATE_KEY);
    const signer = new PaymentSigner(account);
    const claims = buildClaims(account.address);
    const sig = await signer.signRequest(
      buildParams(),
      claims,
      SigningScheme.EIP712,
    );
    expect(sig.scheme).toBe(SigningScheme.EIP712);

    const typed = guaranteeTypedData(buildParams(), claims);
    await expect(
      verifyTypedData({
        ...typed,
        address: account.address,
        signature: sig.signature as Hex,
      } as Parameters<typeof verifyTypedData>[0]),
    ).resolves.toBe(true);
  });

  it("produces a verifiable validated EIP-712 signature", async () => {
    const account = privateKeyToAccount(PRIVATE_KEY);
    const signer = new PaymentSigner(account);
    const claims = buildClaims(account.address).withValidation(validation());
    const sig = await signer.signRequest(
      buildParams(),
      claims,
      SigningScheme.EIP712,
    );

    const typed = guaranteeTypedData(buildParams(), claims);
    expect(typed.primaryType).toBe("SolValidatedGuaranteeRequestClaimsV1");
    await expect(
      verifyTypedData({
        ...typed,
        address: account.address,
        signature: sig.signature as Hex,
      } as Parameters<typeof verifyTypedData>[0]),
    ).resolves.toBe(true);
  });

  it("signs the raw ABI bytes under EIP-191, not their hex spelling", async () => {
    const account = privateKeyToAccount(PRIVATE_KEY);
    const signer = new PaymentSigner(account);
    const claims = buildClaims(account.address);
    const sig = await signer.signRequest(
      buildParams(),
      claims,
      SigningScheme.EIP191,
    );
    expect(sig.scheme).toBe(SigningScheme.EIP191);

    const recovered = await recoverMessageAddress({
      message: { raw: eip191PayloadForClaims(claims) },
      signature: sig.signature as Hex,
    });
    expect(recovered).toBe(account.address);
  });

  it("rejects an unsupported signing scheme", async () => {
    const account = privateKeyToAccount(PRIVATE_KEY);
    const signer = new PaymentSigner(account);
    const claims = buildClaims(account.address);
    await expect(
      signer.signRequest(buildParams(), claims, "unsupported" as SigningScheme),
    ).rejects.toThrow(SigningError);
  });
});
