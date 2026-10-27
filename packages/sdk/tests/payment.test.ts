/**
 * PaymentClient offline: receipt verification against the connected
 * operator, issuance, and the checks a checkpoint batch must pass before the
 * payer signs over it.
 */

import { type Hex, recoverAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import type { ClientCtx } from "@/client/ctx";
import { checkpointPayload, PaymentClient } from "@/client/payment";
import {
  InvalidParamsError,
  ReceiptSignerMismatchError,
  UntrustedCheckpointBatchError,
} from "@/errors";
import {
  clearingHouseDomain,
  Guarantee,
  GuaranteeReceipt,
  guaranteeRegistryDomain,
} from "@/guarantee";
import {
  CheckpointBatchResponse,
  CheckpointPayload,
  PaymentRequest,
  PaymentRequestPayload,
  SignedCheckpoint,
} from "@/models";
import { PayerSigner } from "@/signing";

const CHAIN_ID = 84532;
const ASSET = "0x0000000000000000000000000000000000000000";
const RECIPIENT = "0x00000000000000000000000000000000000000Be";
const CLEARING_HOUSE = "0x00000000000000000000000000000000C1ea4111";
const REGISTRY = "0x0000000000000000000000000000000000065E61";
const CYCLE = `0x${"11".repeat(32)}`;
const OTHER_CYCLE = `0x${"33".repeat(32)}`;

const PAYER = privateKeyToAccount(`0x${"ac".repeat(32)}`);
const OPERATOR = privateKeyToAccount(`0x${"59".repeat(32)}`);
const DOMAIN = clearingHouseDomain(CHAIN_ID, CLEARING_HOUSE);
const RECEIPT_DOMAIN = guaranteeRegistryDomain(CHAIN_ID, REGISTRY);

function ctx(rpc: Record<string, unknown> = {}): ClientCtx {
  return {
    signerAddress: PAYER.address,
    clearingHouseDomain: DOMAIN,
    guaranteeDomain: RECEIPT_DOMAIN,
    guaranteeSigner: OPERATOR.address,
    payerSigner: new PayerSigner(PAYER),
    rpc,
  } as unknown as ClientCtx;
}

/** Request ids follow the timestamp, so payments at distinct times never collide. */
const payment = (
  amount: bigint,
  timestamp: number,
  overrides: Partial<
    ConstructorParameters<typeof PaymentRequestPayload>[0]
  > = {},
) =>
  new PaymentRequestPayload({
    userAddress: PAYER.address,
    recipientAddress: RECIPIENT,
    cycleId: CYCLE,
    reqId: BigInt(timestamp),
    amount,
    assetAddress: ASSET,
    timestamp,
    salt: `0x${"22".repeat(32)}`,
    ...overrides,
  });

async function signedBy(
  signer: ReturnType<typeof privateKeyToAccount>,
  payload: PaymentRequestPayload,
): Promise<PaymentRequest> {
  const signature = await signer.sign({ hash: payload.signingDigest(DOMAIN) });
  return new PaymentRequest(payload, signature);
}

async function checkpointBy(
  signer: ReturnType<typeof privateKeyToAccount>,
  gross: bigint,
  cutoff: number,
  cycleId = CYCLE,
): Promise<SignedCheckpoint> {
  const payload = new CheckpointPayload({
    payer: PAYER.address,
    cycleId,
    assetAddress: ASSET,
    cumulativeGross: gross,
    timestampCutoff: cutoff,
  });
  const signature = await signer.sign({ hash: payload.signingDigest(DOMAIN) });
  return new SignedCheckpoint(payload, signature);
}

const payments = (...entries: [bigint, number][]) =>
  Promise.all(
    entries.map(([amount, ts]) => signedBy(PAYER, payment(amount, ts))),
  );

function batch(
  previous: SignedCheckpoint | undefined,
  authorizations: PaymentRequest[],
  overrides: { cycleId?: string; assetAddress?: string; payer?: string } = {},
): CheckpointBatchResponse {
  return new CheckpointBatchResponse(
    overrides.cycleId ?? CYCLE,
    "0x0:1700000000",
    overrides.assetAddress ?? ASSET,
    overrides.payer ?? PAYER.address,
    previous,
    authorizations,
    2,
  );
}

const build = (b: CheckpointBatchResponse) =>
  checkpointPayload(PAYER.address, ASSET, CYCLE, DOMAIN, b);

async function refused(b: CheckpointBatchResponse): Promise<string> {
  const err = await build(b).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(UntrustedCheckpointBatchError);
  return (err as UntrustedCheckpointBatchError).reason;
}

describe("receipts", () => {
  async function receiptSignedBy(
    signer: ReturnType<typeof privateKeyToAccount>,
  ) {
    const guarantee = Guarantee.fromPayment(
      payment(1_000n, 1_700_000_000),
      BigInt(CYCLE),
    );
    const signature = await signer.sign({
      hash: guarantee.signingDigest(RECEIPT_DOMAIN),
    });
    return { guarantee, receipt: GuaranteeReceipt.new(guarantee, signature) };
  }

  it("verifies the connected operator's receipt", async () => {
    const { guarantee, receipt } = await receiptSignedBy(OPERATOR);
    await expect(
      new PaymentClient(ctx()).verifyGuarantee(receipt),
    ).resolves.toEqual(guarantee);
  });

  it("refuses anyone else's receipt", async () => {
    const { receipt } = await receiptSignedBy(PAYER);
    await expect(
      new PaymentClient(ctx()).verifyGuarantee(receipt),
    ).rejects.toBeInstanceOf(ReceiptSignerMismatchError);
  });

  it("issues a guarantee by posting the signed request", async () => {
    const { receipt } = await receiptSignedBy(OPERATOR);
    const issueGuarantee = vi.fn().mockResolvedValue(receipt);
    const request = await signedBy(PAYER, payment(1_000n, 1_700_000_000));

    await expect(
      new PaymentClient(ctx({ issueGuarantee })).issueGuarantee(request),
    ).resolves.toBe(receipt);
    expect(issueGuarantee).toHaveBeenCalledWith(request);
  });

  it("signs a request under the ClearingHouse domain", async () => {
    const payload = payment(1_000n, 1_700_000_000);
    const signed = await new PaymentClient(ctx()).signRequest(payload);
    await expect(
      recoverAddress({
        hash: payload.signingDigest(DOMAIN),
        signature: signed.signature as Hex,
      }),
    ).resolves.toBe(PAYER.address);
  });
});

describe("checkpointPayload", () => {
  it("extends the previous checkpoint", async () => {
    const payload = await build(
      batch(
        await checkpointBy(PAYER, 50n, 1_699_999_000),
        await payments([10n, 1_700_000_000], [7n, 1_700_000_500]),
      ),
    );
    expect(payload?.cumulativeGross).toBe(67n);
    expect(payload?.timestampCutoff).toBe(1_700_000_500);
    expect(payload?.payer).toBe(PAYER.address);
    expect(payload?.cycleId).toBe(CYCLE);
  });

  it("starts a first checkpoint from zero", async () => {
    const payload = await build(
      batch(undefined, await payments([10n, 1_700_000_000])),
    );
    expect(payload?.cumulativeGross).toBe(10n);
    expect(payload?.timestampCutoff).toBe(1_700_000_000);
  });

  it("cuts off at the latest payment whatever the order", async () => {
    const payload = await build(
      batch(
        undefined,
        await payments([1n, 1_700_000_900], [1n, 1_700_000_100]),
      ),
    );
    expect(payload?.timestampCutoff).toBe(1_700_000_900);
  });

  it("needs no checkpoint for an empty batch", async () => {
    await expect(build(batch(undefined, []))).resolves.toBeUndefined();
  });

  it("matches addresses whatever their casing", async () => {
    const lowered = await signedBy(
      PAYER,
      payment(10n, 1_700_000_000, {
        userAddress: PAYER.address.toLowerCase(),
      }),
    );
    const payload = await build(
      batch(undefined, [lowered], { payer: PAYER.address.toLowerCase() }),
    );
    expect(payload?.cumulativeGross).toBe(10n);
  });

  it("refuses a payment the payer did not sign", async () => {
    // An operator that slips in a payment the payer never signed would
    // inflate what the payer can be charged on default.
    const forged = await signedBy(
      privateKeyToAccount(generatePrivateKey()),
      payment(1_000_000n, 1_700_000_100),
    );
    const reason = await refused(
      batch(undefined, [...(await payments([10n, 1_700_000_000])), forged]),
    );
    expect(reason).toContain("not signed by the payer");
  });

  it("refuses a payment whose amount was tampered with", async () => {
    const [genuine] = await payments([10n, 1_700_000_000]);
    const tampered = new PaymentRequest(
      genuine.payload.with({ amount: 10_000n }),
      genuine.signature,
    );
    expect(await refused(batch(undefined, [tampered]))).toContain(
      "not signed by the payer",
    );
  });

  it("refuses another payer's payment", async () => {
    const stranger = privateKeyToAccount(generatePrivateKey());
    const theirs = await signedBy(
      stranger,
      payment(10n, 1_700_000_000, { userAddress: stranger.address }),
    );
    expect(await refused(batch(undefined, [theirs]))).toContain(
      "another payer",
    );
  });

  it("refuses a payment from another cycle", async () => {
    const elsewhere = await signedBy(
      PAYER,
      payment(10n, 1_700_000_000, { cycleId: OTHER_CYCLE }),
    );
    expect(await refused(batch(undefined, [elsewhere]))).toContain(
      "another payer, cycle or asset",
    );
  });

  it("refuses a payment in another asset", async () => {
    const elsewhere = await signedBy(
      PAYER,
      payment(10n, 1_700_000_000, {
        assetAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      }),
    );
    expect(await refused(batch(undefined, [elsewhere]))).toContain(
      "another payer, cycle or asset",
    );
  });

  it("refuses a payment counted twice", async () => {
    const once = await payments([10n, 1_700_000_000]);
    expect(await refused(batch(undefined, [...once, ...once]))).toContain(
      "appears twice",
    );
  });

  it("refuses a payment the previous checkpoint covers", async () => {
    const reason = await refused(
      batch(
        await checkpointBy(PAYER, 50n, 1_700_000_000),
        await payments([10n, 1_700_000_000]),
      ),
    );
    expect(reason).toContain("already covered");
  });

  it("refuses a previous checkpoint the payer did not sign", async () => {
    // The previous total is carried forward, so a forged one inflates the
    // new checkpoint just as a forged payment would.
    const reason = await refused(
      batch(
        await checkpointBy(
          privateKeyToAccount(generatePrivateKey()),
          1_000_000n,
          1_699_999_000,
        ),
        await payments([10n, 1_700_000_000]),
      ),
    );
    expect(reason).toContain("previous checkpoint");
  });

  it("refuses a previous checkpoint for another cycle", async () => {
    const reason = await refused(
      batch(
        await checkpointBy(PAYER, 50n, 1_699_999_000, OTHER_CYCLE),
        await payments([10n, 1_700_000_000]),
      ),
    );
    expect(reason).toContain(
      "previous checkpoint is for another payer, cycle or asset",
    );
  });

  it("refuses a batch for another cycle", async () => {
    const reason = await refused(
      batch(undefined, await payments([10n, 1_700_000_000]), {
        cycleId: OTHER_CYCLE,
      }),
    );
    expect(reason).toContain("batch is for cycle");
  });

  it("refuses a batch for another asset", async () => {
    const reason = await refused(
      batch(undefined, await payments([10n, 1_700_000_000]), {
        assetAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      }),
    );
    expect(reason).toContain("batch is for asset");
  });

  it("refuses a total past u256", async () => {
    await expect(
      build(
        batch(
          await checkpointBy(PAYER, 2n ** 256n - 5n, 1_699_999_000),
          await payments([10n, 1_700_000_000]),
        ),
      ),
    ).rejects.toBeInstanceOf(InvalidParamsError);
  });
});
