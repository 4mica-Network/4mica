import { describe, expect, it } from "vitest";
import { signatureToWords, signatureToWordsAsync } from "@/bls";
import { VerificationError } from "@/errors";

describe("BLS helpers", () => {
  it("rejects invalid signature hex (sync)", () => {
    expect(() => signatureToWords("0x1234")).toThrow(VerificationError);
  });

  it("rejects invalid signature hex (async)", async () => {
    await expect(signatureToWordsAsync("0x1234")).rejects.toThrow(
      VerificationError,
    );
  });
});
