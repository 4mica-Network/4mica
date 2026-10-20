/**
 * The payer-signing path, pinned against the vectors the ClearingHouse
 * verifies in its own cross-boundary suite.
 *
 * `checkpoint_vectors.json` is core's fixture
 * (`contracts/test/fixtures/checkpoint_vectors.json` in 4mica-core), consumed
 * by `CheckpointCrossBoundary.t.sol`. A drift in the layout, the domain or the
 * encoding breaks these, and with them every payment the on-chain default
 * path would have to verify. Refresh by rerunning core's
 * `checkpoint_golden_vectors` test with `REGEN_CHECKPOINT_VECTORS=1` and
 * copying the file here.
 */

import { readFileSync } from "node:fs";
import { encodeAbiParameters, keccak256, recoverAddress, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  AddressMismatchError,
  InvalidPayerAddressError,
  SigningError,
} from "@/errors";
import {
  CHECKPOINT_TYPE,
  CLEARING_HOUSE_EIP712_NAME,
  CLEARING_HOUSE_EIP712_VERSION,
  clearingHouseDomain,
  domainSeparatorOf,
  PAYMENT_AUTHORIZATION_TYPE,
  recipientCommitment,
  VALIDATION_TYPE,
} from "@/guarantee";
import {
  CheckpointPayload,
  PaymentRequestPayload,
  ValidationRequirement,
} from "@/models";
import { PayerSigner } from "@/signing";

const VECTORS = JSON.parse(
  readFileSync(
    new URL("./fixtures/checkpoint_vectors.json", import.meta.url),
    "utf8",
  ),
);

// The deterministic key behind every pinned signature in the fixture.
const PAYER = privateKeyToAccount(`0x${"42".repeat(32)}`);
const RECIPIENT = "0x00000000000000000000000000000000000000Be";
const CHAIN_ID: number = VECTORS.domain.chainId;
const DOMAIN = clearingHouseDomain(CHAIN_ID, VECTORS.domain.verifyingContract);

const payment = () =>
  PaymentRequestPayload.new({
    userAddress: PAYER.address,
    recipientAddress: RECIPIENT,
    cycleId: `0x${"11".repeat(32)}`,
    reqId: 7n,
    amount: 1_000n,
    timestamp: 1_700_000_000,
    salt: `0x${"22".repeat(32)}`,
  });

const validation = (
  overrides: Partial<
    ConstructorParameters<typeof ValidationRequirement>[0]
  > = {},
) =>
  new ValidationRequirement({
    validator: "eip155:31337:0x1111111111111111111111111111111111111111",
    subject: `0x${"44".repeat(32)}`,
    deadline: 1_700_003_600,
    params: "0x010203",
    ...overrides,
  });

const validatedPayment = () =>
  PaymentRequestPayload.new({
    userAddress: PAYER.address,
    recipientAddress: RECIPIENT,
    cycleId: `0x${"11".repeat(32)}`,
    reqId: 8n,
    amount: 500n,
    timestamp: 1_700_000_001,
    salt: `0x${"33".repeat(32)}`,
  }).withValidation(validation());

const checkpoint = (cumulativeGross = 120n) =>
  new CheckpointPayload({
    payer: PAYER.address,
    cycleId: `0x${"11".repeat(32)}`,
    assetAddress: "0x0000000000000000000000000000000000000000",
    cumulativeGross,
    timestampCutoff: 1_699_999_999,
  });

describe("payer signing against core's fixture", () => {
  it("uses the payer key the fixture was signed with", () => {
    expect(PAYER.address).toBe(VECTORS.signer);
  });

  it("signs under the ClearingHouse domain", () => {
    expect(CLEARING_HOUSE_EIP712_NAME).toBe(VECTORS.domain.name);
    expect(CLEARING_HOUSE_EIP712_VERSION).toBe(VECTORS.domain.version);
  });

  it("pins the type strings the ClearingHouse hard-codes", () => {
    expect(PAYMENT_AUTHORIZATION_TYPE).toBe(
      "PaymentAuthorization(address payer,bytes32 cycleId,address asset," +
        "uint256 amount,uint256 reqId,uint64 timestamp,bytes32 recipientCommitment)",
    );
    expect(CHECKPOINT_TYPE).toBe(
      "Checkpoint(address payer,bytes32 cycleId,address asset," +
        "uint256 cumulativeGross,uint64 timestampCutoff)",
    );
    expect(VALIDATION_TYPE).toBe(
      "Validation(string validator,bytes32 subject,uint64 deadline,bytes params)",
    );
  });

  it("matches the pinned payment", async () => {
    const expected = VECTORS.paymentAuthorization;
    const payload = payment();
    const signed = await new PayerSigner(PAYER).signPaymentRequest(
      DOMAIN,
      payload,
    );

    expect(recipientCommitment(RECIPIENT, payload.salt)).toBe(
      expected.recipientCommitment,
    );
    expect(payload.signingDigest(DOMAIN)).toBe(expected.digest);
    expect(signed.signature).toBe(expected.signature);
    expect(signed.payload).toBe(payload);
  });

  it("matches the pinned validated payment", async () => {
    const expected = VECTORS.validatedPaymentAuthorization;
    const payload = validatedPayment();
    const signed = await new PayerSigner(PAYER).signPaymentRequest(
      DOMAIN,
      payload,
    );

    expect(
      recipientCommitment(RECIPIENT, payload.salt, payload.validation),
    ).toBe(expected.recipientCommitment);
    expect(payload.signingDigest(DOMAIN)).toBe(expected.digest);
    expect(signed.signature).toBe(expected.signature);
  });

  it("matches the pinned checkpoint", async () => {
    const signed = await new PayerSigner(PAYER).signCheckpoint(
      DOMAIN,
      checkpoint(),
    );
    expect(signed.payload.signingDigest(DOMAIN)).toBe(
      VECTORS.checkpoint.digest,
    );
    expect(signed.signature).toBe(VECTORS.checkpoint.signature);
  });

  it("produces a signature that recovers to the payer", async () => {
    const payload = payment();
    const signed = await new PayerSigner(PAYER).signPaymentRequest(
      DOMAIN,
      payload,
    );
    await expect(
      recoverAddress({
        hash: payload.signingDigest(DOMAIN),
        signature: signed.signature as `0x${string}`,
      }),
    ).resolves.toBe(PAYER.address);
  });
});

describe("what a payment commits to", () => {
  it("covers a validation requirement attached after the fact", () => {
    const plain = payment().signingDigest(DOMAIN);
    const validated = payment()
      .withValidation(validation({ deadline: null, params: "0x" }))
      .signingDigest(DOMAIN);
    expect(validated).not.toBe(plain);
  });

  it.each([
    ["validator", "eip155:31337:0x1111111111111111111111111111111111111112"],
    ["subject", `0x${"45".repeat(32)}`],
    ["deadline", null],
    ["params", "0x09"],
  ] as const)("changes the commitment when %s changes", (field, value) => {
    const salt = `0x${"01".repeat(32)}`;
    expect(recipientCommitment(RECIPIENT, salt, validation())).not.toBe(
      recipientCommitment(RECIPIENT, salt, validation({ [field]: value })),
    );
  });

  it("binds the recipient and the salt, whatever the casing", () => {
    const salt = `0x${"01".repeat(32)}`;
    const base = recipientCommitment(RECIPIENT, salt);
    expect(recipientCommitment(RECIPIENT.toLowerCase(), salt)).toBe(base);
    expect(recipientCommitment(`0x${"42".repeat(20)}`, salt)).not.toBe(base);
    expect(recipientCommitment(RECIPIENT, `0x${"02".repeat(32)}`)).not.toBe(
      base,
    );
  });

  it("changes with the salt", () => {
    const other = payment().with({ salt: `0x${"99".repeat(32)}` });
    expect(other.signingDigest(DOMAIN)).not.toBe(
      payment().signingDigest(DOMAIN),
    );
  });

  it("is only valid in its own domain", () => {
    const digest = payment().signingDigest(DOMAIN);
    expect(
      payment().signingDigest(
        clearingHouseDomain(
          CHAIN_ID,
          "0x00000000000000000000000000000000000c1ea8",
        ),
      ),
    ).not.toBe(digest);
    expect(
      payment().signingDigest(
        clearingHouseDomain(CHAIN_ID + 1, VECTORS.domain.verifyingContract),
      ),
    ).not.toBe(digest);
  });

  it("makes a checkpoint's digest depend on its total", () => {
    expect(checkpoint(121n).signingDigest(DOMAIN)).not.toBe(
      checkpoint().signingDigest(DOMAIN),
    );
  });

  it("hashes the domain the way the contract's EIP712 does", () => {
    const expected = keccak256(
      `0x${[
        keccak256(
          toHex(
            "EIP712Domain(string name,string version,uint256 chainId," +
              "address verifyingContract)",
          ),
        ),
        keccak256(toHex("4micaClearingHouse")),
        keccak256(toHex("1")),
        encodeAbiParameters(
          [{ type: "uint256" }, { type: "address" }],
          [BigInt(CHAIN_ID), VECTORS.domain.verifyingContract],
        ),
      ]
        .map((part) => part.slice(2))
        .join("")}`,
    );
    expect(domainSeparatorOf(DOMAIN)).toBe(expected);
  });
});

describe("PayerSigner", () => {
  const stranger = () => privateKeyToAccount(generatePrivateKey());

  it("refuses to sign a payment for another payer", async () => {
    const err = await new PayerSigner(stranger())
      .signPaymentRequest(DOMAIN, payment())
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AddressMismatchError);
    expect((err as AddressMismatchError).payer).toBe(PAYER.address);
  });

  it("refuses to checkpoint for another payer", async () => {
    await expect(
      new PayerSigner(stranger()).signCheckpoint(DOMAIN, checkpoint()),
    ).rejects.toBeInstanceOf(AddressMismatchError);
  });

  it("refuses a payer that is not an address", async () => {
    const payload = Object.assign(
      Object.create(PaymentRequestPayload.prototype),
      {
        ...payment(),
        userAddress: "nope",
      },
    ) as PaymentRequestPayload;
    await expect(
      new PayerSigner(PAYER).signPaymentRequest(DOMAIN, payload),
    ).rejects.toBeInstanceOf(InvalidPayerAddressError);
  });

  it("wraps a wallet that cannot sign typed data", async () => {
    const { signTypedData: _, ...noTypedData } = PAYER;
    void _;
    await expect(
      new PayerSigner(noTypedData as typeof PAYER).signPaymentRequest(
        DOMAIN,
        payment(),
      ),
    ).rejects.toBeInstanceOf(SigningError);
  });

  it("wraps a remote signer's failure", async () => {
    const broken = {
      ...PAYER,
      signTypedData: async () => {
        throw new Error("kms unavailable");
      },
    };
    await expect(
      new PayerSigner(broken).signPaymentRequest(DOMAIN, payment()),
    ).rejects.toThrow(/kms unavailable/);
  });
});
