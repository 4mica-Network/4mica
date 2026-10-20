import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VerificationError } from "@/errors";
import { decodeGuaranteeClaims, encodeGuaranteeClaims } from "@/guarantee";
import type { PaymentGuaranteeClaims } from "@/models";
import { bytesFromHex, hexFromBytes } from "@/utils";

interface GuaranteeVectors {
  v1: {
    domain: string;
    expected: {
      amount: string;
      asset: string;
      client: string;
      cycleId: string;
      recipient: string;
      reqId: string;
      timestamp: number;
      version: number;
    };
    guarantee: string;
    signature: string[];
    verificationKey: string[];
  };
}

// Pinned by crates/rpc/tests/guarantee_golden_vectors.rs and shared with the
// Python and Solidity suites.
const guaranteeVectors: GuaranteeVectors = JSON.parse(
  readFileSync(new URL("./fixtures/guarantee_vectors.json", import.meta.url), {
    encoding: "utf8",
  }),
);

const sampleClaims = (): PaymentGuaranteeClaims => ({
  domain: new Uint8Array(32).fill(7),
  userAddress: "0x0000000000000000000000000000000000000011",
  recipientAddress: "0x0000000000000000000000000000000000000022",
  cycleId: 100n,
  reqId: 7n,
  amount: 1000n,
  assetAddress: "0x0000000000000000000000000000000000000000",
  timestamp: 1700000000,
  version: 1,
});

describe("guarantee codec", () => {
  it("round-trips V1 claims through the envelope", () => {
    const claims = sampleClaims();
    const encoded = encodeGuaranteeClaims(claims);
    const decoded = decodeGuaranteeClaims(encoded);
    expect(decoded.cycleId).toBe(100n);
    expect(decoded.reqId).toBe(7n);
    expect(decoded.amount).toBe(1000n);
    expect(decoded.userAddress.toLowerCase()).toBe(claims.userAddress);
    expect(decoded.recipientAddress.toLowerCase()).toBe(
      claims.recipientAddress,
    );
    expect(decoded.timestamp).toBe(1700000000);
    expect(decoded.version).toBe(1);
    expect(hexFromBytes(decoded.domain)).toBe(hexFromBytes(claims.domain));
  });

  it("decodes the golden guarantee vector", () => {
    const vector = guaranteeVectors.v1;
    const decoded = decodeGuaranteeClaims(vector.guarantee);
    expect(hexFromBytes(decoded.domain)).toBe(vector.domain);
    expect(decoded.userAddress.toLowerCase()).toBe(
      vector.expected.client.toLowerCase(),
    );
    expect(decoded.recipientAddress.toLowerCase()).toBe(
      vector.expected.recipient.toLowerCase(),
    );
    expect(decoded.cycleId).toBe(BigInt(vector.expected.cycleId));
    expect(decoded.reqId).toBe(BigInt(vector.expected.reqId));
    expect(decoded.amount).toBe(BigInt(vector.expected.amount));
    expect(decoded.assetAddress.toLowerCase()).toBe(
      vector.expected.asset.toLowerCase(),
    );
    expect(decoded.timestamp).toBe(vector.expected.timestamp);
    expect(decoded.version).toBe(vector.expected.version);
  });

  it("decodes the legacy bare V1 layout", () => {
    const enveloped = encodeGuaranteeClaims(sampleClaims());
    // Strip the (uint64, bytes) envelope: the inner claims words start at
    // offset 3 * 32 (version word, bytes offset word, bytes length word).
    const bare = bytesFromHex(enveloped).slice(32 * 3);
    expect(bare.length).toBe(32 * 9);
    const decoded = decodeGuaranteeClaims(bare);
    expect(decoded.cycleId).toBe(100n);
    expect(decoded.version).toBe(1);
  });

  it("refuses an unsupported version", () => {
    expect(() =>
      encodeGuaranteeClaims({ ...sampleClaims(), version: 2 }),
    ).toThrow(VerificationError);
  });

  it("refuses a truncated payload", () => {
    expect(() => decodeGuaranteeClaims(new Uint8Array(16))).toThrow(
      VerificationError,
    );
  });

  it("refuses a non-32-byte domain", () => {
    expect(() =>
      encodeGuaranteeClaims({ ...sampleClaims(), domain: new Uint8Array(16) }),
    ).toThrow(VerificationError);
  });
});
