import { readFileSync } from "node:fs";
import { bls12_381 } from "@noble/curves/bls12-381.js";
import { describe, expect, it } from "vitest";
import {
  signatureToWords,
  signatureToWordsAsync,
  verifyBlsSignature,
} from "@/bls";
import { VerificationError } from "@/errors";
import { bytesFromHex } from "@/utils";

const vectors = JSON.parse(
  readFileSync(new URL("./fixtures/guarantee_vectors.json", import.meta.url), {
    encoding: "utf8",
  }),
) as {
  v1: { guarantee: string; signature: string[]; verificationKey: string[] };
};

const joinFp = (hi: string, lo: string): bigint =>
  (BigInt(hi) << 256n) | BigInt(lo);

/** Reassemble a compressed point from the fixture's contract-word encoding. */
function compressedFromWords(words: string[], group: "G1" | "G2"): Uint8Array {
  if (group === "G1") {
    const [xHi, xLo, yHi, yLo] = words;
    const point = bls12_381.G1.Point.fromAffine({
      x: joinFp(xHi, xLo),
      y: joinFp(yHi, yLo),
    });
    return point.toBytes(true);
  }
  const [x0Hi, x0Lo, x1Hi, x1Lo, y0Hi, y0Lo, y1Hi, y1Lo] = words;
  const point = bls12_381.G2.Point.fromAffine({
    x: bls12_381.fields.Fp2.create({
      c0: joinFp(x0Hi, x0Lo),
      c1: joinFp(x1Hi, x1Lo),
    }),
    y: bls12_381.fields.Fp2.create({
      c0: joinFp(y0Hi, y0Lo),
      c1: joinFp(y1Hi, y1Lo),
    }),
  });
  return point.toBytes(true);
}

describe("BLS helpers", () => {
  it("rejects invalid signature hex (async)", async () => {
    await expect(signatureToWordsAsync("0x1234")).rejects.toThrow(
      VerificationError,
    );
  });

  it("expands a signature into contract words and back", async () => {
    const signature = compressedFromWords(vectors.v1.signature, "G2");
    const words = await signatureToWordsAsync(
      Buffer.from(signature).toString("hex"),
    );
    expect(
      words.map((word) => `0x${Buffer.from(word).toString("hex")}`),
    ).toEqual(vectors.v1.signature);
    // The async path loads the module, so the sync variant now works too.
    expect(() =>
      signatureToWords(Buffer.from(signature).toString("hex")),
    ).not.toThrow();
  });

  it("verifies the golden guarantee signature", async () => {
    const publicKey = compressedFromWords(vectors.v1.verificationKey, "G1");
    const signatureHex = `0x${Buffer.from(
      compressedFromWords(vectors.v1.signature, "G2"),
    ).toString("hex")}`;
    const message = bytesFromHex(vectors.v1.guarantee);

    await expect(
      verifyBlsSignature(publicKey, message, signatureHex),
    ).resolves.toBe(true);

    const tampered = new Uint8Array(message);
    tampered[tampered.length - 1] ^= 1;
    await expect(
      verifyBlsSignature(publicKey, tampered, signatureHex),
    ).resolves.toBe(false);
  });

  it("rejects a public key of the wrong length", async () => {
    await expect(
      verifyBlsSignature(new Uint8Array(32), new Uint8Array(1), "0x"),
    ).rejects.toThrow(VerificationError);
  });
});
