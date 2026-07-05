import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { SigningError } from "../src/errors";
import {
  CorePublicParameters,
  PaymentGuaranteeRequestClaims,
  PaymentGuaranteeRequestClaimsV2,
  SigningScheme,
} from "../src/models";
import { PaymentSigner, validateGuaranteeTypedData } from "../src/signing";
import { ValidationError } from "../src/utils";
import {
  computeValidationRequestHash,
  computeValidationSubjectHash,
} from "../src/validation";

const PRIVATE_KEY =
  "0x59c6995e998f97a5a0044976f7be35d5ad91c0cfa55b5cfb20b07a1c60f4c5bc" as Hex;

function buildV2Claims(userAddress: string): PaymentGuaranteeRequestClaimsV2 {
  const base = PaymentGuaranteeRequestClaims.new(
    userAddress,
    "0x0000000000000000000000000000000000000002",
    123,
    999,
    null,
    2,
  );
  const validationSubjectHash = computeValidationSubjectHash(base);
  const partial = new PaymentGuaranteeRequestClaimsV2({
    userAddress: base.userAddress,
    recipientAddress: base.recipientAddress,
    reqId: base.reqId,
    amount: base.amount,
    timestamp: base.timestamp,
    assetAddress: base.assetAddress,
    validationRegistryAddress: "0x0000000000000000000000000000000000000011",
    validationRequestHash: "0x" + "00".repeat(32),
    validationChainId: 1,
    validatorAddress: "0x0000000000000000000000000000000000000022",
    validatorAgentId: 7n,
    minValidationScore: 80,
    validationSubjectHash,
    jobHash: "0x" + "11".repeat(32),
    requiredValidationTag: "",
  });
  return new PaymentGuaranteeRequestClaimsV2({
    ...partial,
    validationRequestHash: computeValidationRequestHash(partial),
  });
}

function buildParams(): CorePublicParameters {
  return new CorePublicParameters(
    new Uint8Array(),
    "0x0000000000000000000000000000000000000000",
    "https://example.com",
    "4Mica",
    "1",
    1,
  );
}

describe("PaymentSigner", () => {
  it("rejects address mismatch", async () => {
    const signer = new PaymentSigner(
      privateKeyToAccount(("0x" + "11".repeat(32)) as Hex),
    );
    const claims = PaymentGuaranteeRequestClaims.new(
      "0x0000000000000000000000000000000000000011",
      "0x0000000000000000000000000000000000000002",
      5,
      1234,
      null,
      7,
    );
    await expect(
      signer.signRequest(buildParams(), claims, SigningScheme.EIP712),
    ).rejects.toThrow(SigningError);
  });

  it("produces eip712 signature", async () => {
    const privateKey =
      "0x59c6995e998f97a5a0044976f7be35d5ad91c0cfa55b5cfb20b07a1c60f4c5bc";
    const localSigner = privateKeyToAccount(privateKey);
    const signer = new PaymentSigner(localSigner);
    const accountAddress = localSigner.address.toLowerCase();
    const claims = PaymentGuaranteeRequestClaims.new(
      accountAddress,
      "0x0000000000000000000000000000000000000002",
      123,
      999,
      null,
      2,
    );
    const sig = await signer.signRequest(
      buildParams(),
      claims,
      SigningScheme.EIP712,
    );
    expect(sig.scheme).toBe(SigningScheme.EIP712);
    expect(sig.signature.length).toBe(132);
  });

  it("produces eip191 signature", async () => {
    const privateKey =
      "0x59c6995e998f97a5a0044976f7be35d5ad91c0cfa55b5cfb20b07a1c60f4c5bc";
    const localSigner = privateKeyToAccount(privateKey);
    const signer = new PaymentSigner(localSigner);
    const accountAddress = localSigner.address.toLowerCase();
    const claims = PaymentGuaranteeRequestClaims.new(
      accountAddress,
      "0x0000000000000000000000000000000000000002",
      123,
      999,
      null,
      2,
    );
    const sig = await signer.signRequest(
      buildParams(),
      claims,
      SigningScheme.EIP191,
    );
    expect(sig.scheme).toBe(SigningScheme.EIP191);
    expect(sig.signature.startsWith("0x")).toBe(true);
  });
});

describe("PaymentGuaranteeRequestClaimsV2", () => {
  it("rejects minValidationScore = 0", () => {
    expect(
      () =>
        new PaymentGuaranteeRequestClaimsV2({
          userAddress: "0x0000000000000000000000000000000000000001",
          recipientAddress: "0x0000000000000000000000000000000000000002",
          reqId: 0n,
          amount: 1n,
          timestamp: 1,
          assetAddress: "0x0000000000000000000000000000000000000000",
          validationRegistryAddress:
            "0x0000000000000000000000000000000000000011",
          validationRequestHash: "0x" + "00".repeat(32),
          validationChainId: 1,
          validatorAddress: "0x0000000000000000000000000000000000000022",
          validatorAgentId: 1n,
          minValidationScore: 0,
          validationSubjectHash: "0x" + "00".repeat(32),
          jobHash: "0x" + "11".repeat(32),
          requiredValidationTag: "",
        }),
    ).toThrow("minValidationScore");
  });

  it("rejects minValidationScore > 100", () => {
    expect(
      () =>
        new PaymentGuaranteeRequestClaimsV2({
          userAddress: "0x0000000000000000000000000000000000000001",
          recipientAddress: "0x0000000000000000000000000000000000000002",
          reqId: 0n,
          amount: 1n,
          timestamp: 1,
          assetAddress: "0x0000000000000000000000000000000000000000",
          validationRegistryAddress:
            "0x0000000000000000000000000000000000000011",
          validationRequestHash: "0x" + "00".repeat(32),
          validationChainId: 1,
          validatorAddress: "0x0000000000000000000000000000000000000022",
          validatorAgentId: 1n,
          minValidationScore: 101,
          validationSubjectHash: "0x" + "00".repeat(32),
          jobHash: "0x" + "11".repeat(32),
          requiredValidationTag: "",
        }),
    ).toThrow("minValidationScore");
  });

  it("computeValidationSubjectHash is deterministic", () => {
    const claims = PaymentGuaranteeRequestClaims.new(
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002",
      5,
      100,
      null,
      3,
    );
    const h1 = computeValidationSubjectHash(claims);
    const h2 = computeValidationSubjectHash(claims);
    expect(h1).toBe(h2);
    expect(h1.startsWith("0x")).toBe(true);
    expect(h1.length).toBe(66);
  });

  it("computeValidationRequestHash changes when policy changes", () => {
    const localSigner = privateKeyToAccount(PRIVATE_KEY);
    const v2a = buildV2Claims(localSigner.address.toLowerCase());
    const v2b = new PaymentGuaranteeRequestClaimsV2({
      ...v2a,
      minValidationScore: 90,
      validationRequestHash: "0x" + "00".repeat(32),
    });
    const hashA = computeValidationRequestHash(v2a);
    const hashB = computeValidationRequestHash(v2b);
    expect(hashA).not.toBe(hashB);
  });
});

describe("PaymentSigner V2", () => {
  it("produces eip712 V2 signature", async () => {
    const localSigner = privateKeyToAccount(PRIVATE_KEY);
    const signer = new PaymentSigner(localSigner);
    const claims = buildV2Claims(localSigner.address.toLowerCase());
    const sig = await signer.signRequest(
      buildParams(),
      claims,
      SigningScheme.EIP712,
    );
    expect(sig.scheme).toBe(SigningScheme.EIP712);
    expect(sig.signature.length).toBe(132);
  });

  it("produces eip191 V2 signature", async () => {
    const localSigner = privateKeyToAccount(PRIVATE_KEY);
    const signer = new PaymentSigner(localSigner);
    const claims = buildV2Claims(localSigner.address.toLowerCase());
    const sig = await signer.signRequest(
      buildParams(),
      claims,
      SigningScheme.EIP191,
    );
    expect(sig.scheme).toBe(SigningScheme.EIP191);
    expect(sig.signature.startsWith("0x")).toBe(true);
  });

  it("V1 signatures unchanged by V2 addition", async () => {
    const localSigner = privateKeyToAccount(PRIVATE_KEY);
    const signer = new PaymentSigner(localSigner);
    const claims = PaymentGuaranteeRequestClaims.new(
      localSigner.address.toLowerCase(),
      "0x0000000000000000000000000000000000000002",
      123,
      999,
      null,
      2,
    );
    const sig = await signer.signRequest(
      buildParams(),
      claims,
      SigningScheme.EIP712,
    );
    expect(sig.scheme).toBe(SigningScheme.EIP712);
    expect(sig.signature.length).toBe(132);
  });
});

describe("PaymentSigner unsupported scheme", () => {
  it("rejects unsupported signing scheme", async () => {
    const localSigner = privateKeyToAccount(PRIVATE_KEY);
    const signer = new PaymentSigner(localSigner);
    const claims = PaymentGuaranteeRequestClaims.new(
      localSigner.address.toLowerCase(),
      "0x0000000000000000000000000000000000000002",
      123,
      999,
      null,
      2,
    );
    await expect(
      signer.signRequest(buildParams(), claims, "unsupported" as SigningScheme),
    ).rejects.toThrow(SigningError);
  });
});

describe("validateGuaranteeTypedData", () => {
  it("rejects missing fields", () => {
    expect(() =>
      validateGuaranteeTypedData({
        domain: {},
        types: {},
        message: {},
      }),
    ).toThrow(ValidationError);
  });

  it("rejects chainId mismatch when provided", () => {
    const payload = {
      domain: { chainId: 1 },
      types: {
        SolGuaranteeRequestClaimsV1: [
          { name: "user", type: "address" },
          { name: "recipient", type: "address" },
          { name: "reqId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "asset", type: "address" },
          { name: "timestamp", type: "uint64" },
        ],
      },
      message: {
        user: "0x0000000000000000000000000000000000000001",
        recipient: "0x0000000000000000000000000000000000000002",
        reqId: "2",
        amount: "3",
        asset: "0x0000000000000000000000000000000000000000",
        timestamp: "4",
      },
    };
    expect(() =>
      validateGuaranteeTypedData(payload, { expectedChainId: 2 }),
    ).toThrow(ValidationError);
  });

  it("rejects non-numeric domain chainId when expectedChainId is set", () => {
    const payload = {
      domain: { chainId: null },
      types: {
        SolGuaranteeRequestClaimsV1: [
          { name: "user", type: "address" },
          { name: "recipient", type: "address" },
          { name: "reqId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "asset", type: "address" },
          { name: "timestamp", type: "uint64" },
        ],
      },
      message: {
        user: "0x0000000000000000000000000000000000000001",
        recipient: "0x0000000000000000000000000000000000000002",
        reqId: "2",
        amount: "3",
        asset: "0x0000000000000000000000000000000000000000",
        timestamp: "4",
      },
    };
    expect(() =>
      validateGuaranteeTypedData(payload, { expectedChainId: 1 }),
    ).toThrow(ValidationError);
  });

  it("rejects mismatched expectedSigner", () => {
    const payload = {
      domain: {},
      types: {
        SolGuaranteeRequestClaimsV1: [
          { name: "user", type: "address" },
          { name: "recipient", type: "address" },
          { name: "reqId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "asset", type: "address" },
          { name: "timestamp", type: "uint64" },
        ],
      },
      message: {
        user: "0x0000000000000000000000000000000000000001",
        recipient: "0x0000000000000000000000000000000000000002",
        reqId: "2",
        amount: "3",
        asset: "0x0000000000000000000000000000000000000000",
        timestamp: "4",
      },
    };
    expect(() =>
      validateGuaranteeTypedData(payload, {
        expectedSigner: "0x0000000000000000000000000000000000000099",
      }),
    ).toThrow(ValidationError);
  });
});
