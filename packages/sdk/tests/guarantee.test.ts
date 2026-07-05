import { encodeAbiParameters } from "viem";
import { describe, expect, it } from "vitest";
import { VerificationError } from "../src/errors";
import { decodeGuaranteeClaims, encodeGuaranteeClaims } from "../src/guarantee";
import type { PaymentGuaranteeClaims } from "../src/models";

const V2_POLICY = {
  validationRegistryAddress: "0x0000000000000000000000000000000000000011",
  validationRequestHash: "0x" + "ab".repeat(32),
  validationChainId: 1,
  validatorAddress: "0x0000000000000000000000000000000000000022",
  validatorAgentId: 42n,
  minValidationScore: 80,
  validationSubjectHash: "0x" + "cd".repeat(32),
  jobHash: "0x" + "ef".repeat(32),
  requiredValidationTag: "trust-level-1",
};

describe("guarantee codec", () => {
  it("round trips guarantee claims", () => {
    const claims: PaymentGuaranteeClaims = {
      domain: new Uint8Array(32),
      userAddress: "0x0000000000000000000000000000000000000001",
      recipientAddress: "0x0000000000000000000000000000000000000002",
      cycleId: 1n,
      reqId: 2n,
      amount: 3n,
      assetAddress: "0x0000000000000000000000000000000000000000",
      timestamp: 123456,
      version: 1,
    };
    const encoded = encodeGuaranteeClaims(claims);
    const decoded = decodeGuaranteeClaims(encoded);
    expect(decoded.userAddress).toBe(claims.userAddress);
    expect(decoded.recipientAddress).toBe(claims.recipientAddress);
    expect(decoded.cycleId).toBe(claims.cycleId);
    expect(decoded.amount).toBe(claims.amount);
  });

  it("rejects unsupported guarantee version on encode", () => {
    const claims: PaymentGuaranteeClaims = {
      domain: new Uint8Array(32),
      userAddress: "0x0000000000000000000000000000000000000001",
      recipientAddress: "0x0000000000000000000000000000000000000002",
      cycleId: 1n,
      reqId: 2n,
      amount: 3n,
      assetAddress: "0x0000000000000000000000000000000000000000",
      timestamp: 123456,
      version: 99,
    };
    expect(() => encodeGuaranteeClaims(claims)).toThrow(VerificationError);
  });

  it("rejects V2 encode when validationPolicy is missing", () => {
    const claims: PaymentGuaranteeClaims = {
      domain: new Uint8Array(32),
      userAddress: "0x0000000000000000000000000000000000000001",
      recipientAddress: "0x0000000000000000000000000000000000000002",
      cycleId: 1n,
      reqId: 2n,
      amount: 3n,
      assetAddress: "0x0000000000000000000000000000000000000000",
      timestamp: 123456,
      version: 2,
    };
    expect(() => encodeGuaranteeClaims(claims)).toThrow(VerificationError);
  });

  it("round trips V2 guarantee claims", () => {
    const claims: PaymentGuaranteeClaims = {
      domain: new Uint8Array(32),
      userAddress: "0x0000000000000000000000000000000000000001",
      recipientAddress: "0x0000000000000000000000000000000000000002",
      cycleId: 5n,
      reqId: 6n,
      amount: 100n,
      assetAddress: "0x0000000000000000000000000000000000000000",
      timestamp: 999999,
      version: 2,
      validationPolicy: V2_POLICY,
    };
    const encoded = encodeGuaranteeClaims(claims);
    const decoded = decodeGuaranteeClaims(encoded);

    expect(decoded.version).toBe(2);
    expect(decoded.userAddress).toBe(claims.userAddress);
    expect(decoded.recipientAddress).toBe(claims.recipientAddress);
    expect(decoded.cycleId).toBe(claims.cycleId);
    expect(decoded.reqId).toBe(claims.reqId);
    expect(decoded.amount).toBe(claims.amount);
    expect(decoded.timestamp).toBe(claims.timestamp);

    const policy = decoded.validationPolicy!;
    expect(policy.validationRegistryAddress.toLowerCase()).toBe(
      V2_POLICY.validationRegistryAddress.toLowerCase(),
    );
    expect(policy.validationRequestHash).toBe(V2_POLICY.validationRequestHash);
    expect(policy.validationChainId).toBe(V2_POLICY.validationChainId);
    expect(policy.validatorAddress.toLowerCase()).toBe(
      V2_POLICY.validatorAddress.toLowerCase(),
    );
    expect(policy.validatorAgentId).toBe(V2_POLICY.validatorAgentId);
    expect(policy.minValidationScore).toBe(V2_POLICY.minValidationScore);
    expect(policy.validationSubjectHash).toBe(V2_POLICY.validationSubjectHash);
    expect(policy.requiredValidationTag).toBe(V2_POLICY.requiredValidationTag);
  });

  it("decodes a core-generated V2 guarantee payload", () => {
    const claims: PaymentGuaranteeClaims = {
      domain: new Uint8Array(32),
      userAddress: "0x0000000000000000000000000000000000000001",
      recipientAddress: "0x0000000000000000000000000000000000000002",
      cycleId: 3n,
      reqId: 3n,
      amount: 1000n,
      assetAddress: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
      timestamp: 1700000000,
      version: 2,
      validationPolicy: {
        ...V2_POLICY,
        validationChainId: 84532,
        validatorAgentId: 1n,
        requiredValidationTag: "",
      },
    };
    const decoded = decodeGuaranteeClaims(encodeGuaranteeClaims(claims));
    expect(decoded.version).toBe(2);
    expect(decoded.cycleId).toBe(3n);
    expect(decoded.reqId).toBe(3n);
    expect(decoded.amount).toBe(1000n);
    expect(decoded.assetAddress.toLowerCase()).toBe(
      "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    );
    expect(decoded.validationPolicy?.validationChainId).toBe(84532);
    expect(decoded.validationPolicy?.validatorAgentId).toBe(1n);
    expect(decoded.validationPolicy?.minValidationScore).toBe(80);
    expect(decoded.validationPolicy?.requiredValidationTag).toBe("");
  });

  it("V1 and V2 decoded with correct version field", () => {
    const v1: PaymentGuaranteeClaims = {
      domain: new Uint8Array(32),
      userAddress: "0x0000000000000000000000000000000000000001",
      recipientAddress: "0x0000000000000000000000000000000000000002",
      cycleId: 1n,
      reqId: 0n,
      amount: 1n,
      assetAddress: "0x0000000000000000000000000000000000000000",
      timestamp: 1,
      version: 1,
    };
    const v2: PaymentGuaranteeClaims = {
      ...v1,
      version: 2,
      validationPolicy: V2_POLICY,
    };
    expect(decodeGuaranteeClaims(encodeGuaranteeClaims(v1)).version).toBe(1);
    expect(decodeGuaranteeClaims(encodeGuaranteeClaims(v2)).version).toBe(2);
  });

  it("rejects invalid domain size", () => {
    const claims: PaymentGuaranteeClaims = {
      domain: new Uint8Array(31),
      userAddress: "0x0000000000000000000000000000000000000001",
      recipientAddress: "0x0000000000000000000000000000000000000002",
      cycleId: 1n,
      reqId: 2n,
      amount: 3n,
      assetAddress: "0x0000000000000000000000000000000000000000",
      timestamp: 123456,
      version: 1,
    };
    expect(() => encodeGuaranteeClaims(claims)).toThrow(VerificationError);
  });

  it("rejects unsupported wrapped claims version", () => {
    const raw = encodeAbiParameters(
      [{ type: "uint64" }, { type: "bytes" }],
      [99n, "0x" + "00".repeat(32 * 10)],
    );
    expect(() => decodeGuaranteeClaims(raw)).toThrow(VerificationError);
  });

  it("rejects invalid claims length", () => {
    expect(() => decodeGuaranteeClaims("0x1234")).toThrow(VerificationError);
  });

  it("decodes legacy unwrapped V1 format (no outer envelope)", () => {
    // The decoder accepts raw 288-byte V1 ABI encoding without the (uint64, bytes) wrapper
    const rawV1 = encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint64" },
        { type: "uint64" },
      ],
      [
        "0x" + "00".repeat(32),
        11n,
        22n,
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        33n,
        "0x0000000000000000000000000000000000000000",
        555n,
        1n,
      ],
    );
    const decoded = decodeGuaranteeClaims(rawV1);
    expect(decoded.version).toBe(1);
    expect(decoded.cycleId).toBe(11n);
    expect(decoded.reqId).toBe(22n);
    expect(decoded.amount).toBe(33n);
  });

  it("rejects wrapped V1 with incorrect inner byte length", () => {
    // Outer envelope says version=1 but inner bytes are not 320 bytes
    const raw = encodeAbiParameters(
      [{ type: "uint64" }, { type: "bytes" }],
      [1n, "0x" + "00".repeat(100)],
    );
    expect(() => decodeGuaranteeClaims(raw)).toThrow(VerificationError);
  });

  it("rejects unsupported claims version inside payload", () => {
    const encoded = encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint64" },
        { type: "uint64" },
      ],
      [
        "0x" + "00".repeat(32),
        1n,
        2n,
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        3n,
        "0x0000000000000000000000000000000000000000",
        5n,
        2n,
      ],
    );
    expect(() => decodeGuaranteeClaims(encoded)).toThrow(VerificationError);
  });
});
