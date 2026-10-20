/**
 * The operator's guarantee receipt: layout, decoding, and offline
 * verification.
 *
 * `guarantee_vectors.json` is core's cross-boundary fixture
 * (`contracts/test/fixtures/guarantee_vectors.json` in 4mica-core), which the
 * GuaranteeRegistry's Solidity suite verifies through `verifyGuarantee`. To
 * refresh it, rerun core's `guarantee_golden_vectors` test with
 * `REGEN_GUARANTEE_VECTORS=1` and copy the file here.
 */

import { readFileSync } from "node:fs";
import { keccak256, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  MalformedReceiptError,
  ReceiptSignerMismatchError,
  UnreadableReceiptSignatureError,
} from "@/errors";
import {
  GUARANTEE_REGISTRY_EIP712_NAME,
  GUARANTEE_REGISTRY_EIP712_VERSION,
  GUARANTEE_V1_TYPE,
  GUARANTEE_V1_TYPE_HASH,
  Guarantee,
  GuaranteeReceipt,
  guaranteeRegistryDomain,
  verifyGuaranteeReceipt,
} from "@/guarantee";
import { PaymentRequestPayload } from "@/models";

const VECTORS = JSON.parse(
  readFileSync(
    new URL("./fixtures/guarantee_vectors.json", import.meta.url),
    "utf8",
  ),
);

// The deterministic key core's fixture stands the operator in with.
const OPERATOR = privateKeyToAccount(`0x${"24".repeat(32)}`);
const CHAIN_ID: number = VECTORS.domain.chainId;
const REGISTRY: string = VECTORS.domain.verifyingContract;
const DOMAIN = guaranteeRegistryDomain(CHAIN_ID, REGISTRY);

function vectorGuarantee(): Guarantee {
  const g = VECTORS.guarantee;
  return new Guarantee({
    cycleId: BigInt(g.cycleId),
    reqId: BigInt(g.reqId),
    client: g.client,
    recipient: g.recipient,
    amount: BigInt(g.amount),
    asset: g.asset,
    timestamp: g.timestamp,
  });
}

async function issued(
  signer = OPERATOR,
  guarantee = vectorGuarantee(),
): Promise<GuaranteeReceipt> {
  const signature = await signer.sign({
    hash: guarantee.signingDigest(DOMAIN),
  });
  return GuaranteeReceipt.new(guarantee, signature);
}

describe("guarantee receipts against core's fixture", () => {
  it("uses the operator key the fixture was signed with", () => {
    expect(OPERATOR.address).toBe(VECTORS.signer);
  });

  it("signs under the GuaranteeRegistry domain", () => {
    expect(GUARANTEE_REGISTRY_EIP712_NAME).toBe(VECTORS.domain.name);
    expect(GUARANTEE_REGISTRY_EIP712_VERSION).toBe(VECTORS.domain.version);
  });

  it("pins the layout the verifier is registered under", () => {
    // The type hash is the registry key, so drift unregisters the layout
    // rather than merely breaking a signature.
    expect(GUARANTEE_V1_TYPE).toBe(
      "GuaranteeV1(uint256 cycleId,uint256 reqId,address client," +
        "address recipient,uint256 amount,address asset,uint64 timestamp)",
    );
    expect(GUARANTEE_V1_TYPE_HASH).toBe(keccak256(toHex(GUARANTEE_V1_TYPE)));
    expect(GUARANTEE_V1_TYPE_HASH).toBe(VECTORS.typeHash);
  });

  it("matches core's digest, signature and receipt bytes", async () => {
    const receipt = await issued();
    expect(vectorGuarantee().signingDigest(DOMAIN)).toBe(
      VECTORS.guarantee.digest,
    );
    expect(receipt.signature).toBe(VECTORS.guarantee.signature);
    expect(receipt.receipt).toBe(VECTORS.guarantee.receipt);
  });

  it("decodes core's receipt to its guarantee", () => {
    const receipt = new GuaranteeReceipt(
      VECTORS.guarantee.receipt,
      VECTORS.guarantee.signature,
    );
    expect(receipt.guarantee()).toEqual(vectorGuarantee());
    expect(receipt.guarantee().version).toBe(1);
  });
});

describe("verifyGuaranteeReceipt", () => {
  it("accepts the operator's receipt", async () => {
    const receipt = await issued();
    await expect(
      verifyGuaranteeReceipt(receipt, DOMAIN, OPERATOR.address),
    ).resolves.toEqual(vectorGuarantee());
  });

  it("compares the operator address case-insensitively", async () => {
    const receipt = await issued();
    await expect(
      verifyGuaranteeReceipt(receipt, DOMAIN, OPERATOR.address.toLowerCase()),
    ).resolves.toBeInstanceOf(Guarantee);
  });

  it("refuses anyone else's receipt", async () => {
    const receipt = await issued(privateKeyToAccount(generatePrivateKey()));
    await expect(
      verifyGuaranteeReceipt(receipt, DOMAIN, OPERATOR.address),
    ).rejects.toBeInstanceOf(ReceiptSignerMismatchError);
  });

  it("does not carry a receipt to another deployment", async () => {
    // The domain is inside the digest, so a receipt minted for one
    // deployment cannot be replayed against another.
    const receipt = await issued();
    const elsewhere = guaranteeRegistryDomain(
      CHAIN_ID,
      "0x00000000000000000000000000000000000000Be",
    );
    await expect(
      verifyGuaranteeReceipt(receipt, elsewhere, OPERATOR.address),
    ).rejects.toBeInstanceOf(ReceiptSignerMismatchError);
  });

  it("refuses a receipt whose guarantee was altered after signing", async () => {
    const genuine = await issued();
    const g = vectorGuarantee();
    const inflated = new Guarantee({ ...g, amount: g.amount * 10n });
    const forged = GuaranteeReceipt.new(inflated, genuine.signature);
    await expect(
      verifyGuaranteeReceipt(forged, DOMAIN, OPERATOR.address),
    ).rejects.toBeInstanceOf(ReceiptSignerMismatchError);
  });

  it.each([
    "0x",
    "0x1234",
    "not hex",
    `0x${"00".repeat(65)}`,
  ])("refuses an unreadable signature %s", async (signature) => {
    const receipt = GuaranteeReceipt.new(vectorGuarantee(), signature);
    await expect(
      verifyGuaranteeReceipt(receipt, DOMAIN, OPERATOR.address),
    ).rejects.toBeInstanceOf(UnreadableReceiptSignatureError);
  });

  it("refuses a truncated receipt", async () => {
    const genuine = await issued();
    const truncated = new GuaranteeReceipt(
      genuine.receipt.slice(0, 10),
      genuine.signature,
    );
    await expect(
      verifyGuaranteeReceipt(truncated, DOMAIN, OPERATOR.address),
    ).rejects.toThrow(/shorter than a type hash/);
  });
});

describe("Guarantee", () => {
  it("refuses to decode what the chain would refuse", () => {
    const good = vectorGuarantee().receiptBytes();

    // 31 bytes: shorter than the type hash.
    expect(() => Guarantee.decode(good.slice(0, 64))).toThrow(/shorter/);
    const flipped = `0x${(Number.parseInt(good.slice(2, 4), 16) ^ 0xff)
      .toString(16)
      .padStart(2, "0")}${good.slice(4)}`;
    expect(() => Guarantee.decode(flipped)).toThrow(/not a layout/);
    expect(() => Guarantee.decode(good.slice(0, -2))).toThrow(
      /not a GuaranteeV1/,
    );
    expect(() => Guarantee.decode("0xzz")).toThrow(MalformedReceiptError);
  });

  it("encodes the receipt as the type hash then the signed guarantee", () => {
    const guarantee = vectorGuarantee();
    const data = guarantee.receiptBytes();
    expect(data.slice(0, 66)).toBe(GUARANTEE_V1_TYPE_HASH);
    expect((data.length - 2) / 2).toBe(32 + 7 * 32);
    expect(Guarantee.decode(data)).toEqual(guarantee);
  });

  it("is built from the payment it guarantees", () => {
    const payload = PaymentRequestPayload.new({
      userAddress: "0x1234567890123456789012345678901234567890",
      recipientAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      cycleId: `0x${"55".repeat(32)}`,
      reqId: 7n,
      amount: 1_000n,
      timestamp: 1_736_000_000,
    });
    const guarantee = Guarantee.fromPayment(payload, 0x1234n);

    expect(guarantee.cycleId).toBe(0x1234n);
    expect(guarantee.reqId).toBe(7n);
    expect(guarantee.client).toBe("0x1234567890123456789012345678901234567890");
    expect(guarantee.recipient).toBe(
      "0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD",
    );
    expect(guarantee.amount).toBe(1_000n);
    expect(guarantee.asset).toBe("0x0000000000000000000000000000000000000000");
    expect(guarantee.timestamp).toBe(1_736_000_000);
  });

  it("round-trips a receipt through the wire", async () => {
    const receipt = await issued();
    expect(GuaranteeReceipt.fromRpc(receipt.toPayload())).toEqual(receipt);
  });
});
