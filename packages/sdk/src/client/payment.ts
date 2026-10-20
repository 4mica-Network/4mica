/**
 * Payment guarantees: the payer signs a request, the recipient redeems it for
 * a receipt the operator signed, and either side can verify that receipt
 * offline. Port of `sdk-rust/src/client/payment.rs`.
 */

import type { ClientCtx } from "@/client/ctx";
import { Asset } from "@/client/model";
import {
  CheckpointMismatchError,
  CheckpointRequiredError,
  CycleMismatchError,
  FutureTimestampError,
  InvalidParamsError,
  RpcError,
  StaleTimestampError,
  TimestampNotPastCutoffError,
  UntrustedCheckpointBatchError,
} from "@/errors";
import {
  type FourMicaEip712Domain,
  type Guarantee,
  type GuaranteeReceipt,
  recoverSigner,
  verifyGuaranteeReceipt,
} from "@/guarantee";
import {
  type ActiveCycleResponse,
  type CheckpointAcceptedResponse,
  type CheckpointBatchResponse,
  CheckpointPayload,
  type PaymentRequest,
  PaymentRequestPayload,
  parseCheckpointMismatchDetails,
  parseCheckpointRequiredDetails,
  parseCycleMismatchDetails,
  parseFutureTimestampDetails,
  parseStaleTimestampDetails,
  parseTimestampNotPastCutoffDetails,
  type RecipientPaymentInfo,
  type SignedCheckpoint,
} from "@/models";
import {
  normalizeAddress,
  normalizeBytes32Hex,
  randomU256,
  ValidationError,
} from "@/utils";

/** An {@link Asset}, a token address, or `undefined` for native ETH. */
export type AssetLike = Asset | string | null | undefined;

const U256_MAX = 2n ** 256n - 1n;

function assetAddress(asset: AssetLike): string {
  return Asset.coerce(asset).address;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class PaymentClient {
  constructor(private ctx: ClientCtx) {}

  // --- payer -------------------------------------------------------------

  /**
   * A payment payload for the signer, scoped to the asset's active
   * settlement cycle.
   *
   * Stamped by core's clock as last reported, not this machine's, since core
   * refuses a payment stamped later than its own clock. Waits out the rest of
   * the current second when the payer's last checkpoint covers it, since a
   * payment must be stamped strictly after what the checkpoint accounts for.
   */
  async newPayment(
    recipient: string,
    amount: bigint | number | string,
    asset?: AssetLike,
  ): Promise<PaymentRequestPayload> {
    const address = assetAddress(asset);
    const cycle = await this.ctx.activeCycle(address);
    const timestamp = Math.max(
      await this.nextPaymentTimestamp(address),
      cycle.periodStart,
    );
    return PaymentRequestPayload.new({
      userAddress: this.ctx.signerAddress,
      recipientAddress: normalizeAddress(recipient),
      cycleId: cycle.id,
      reqId: randomU256(),
      amount,
      timestamp,
      erc20Token: address,
    });
  }

  /**
   * Sign a payment as the payer. Hand the result to the recipient, who
   * redeems it with {@link issueGuarantee}.
   */
  async signRequest(payload: PaymentRequestPayload): Promise<PaymentRequest> {
    return this.ctx.payerSigner.signPaymentRequest(
      this.ctx.clearingHouseDomain,
      payload,
    );
  }

  /**
   * Sign and submit a checkpoint covering the payer's outstanding payments in
   * `asset`'s active cycle. `undefined` when there is nothing to cover.
   */
  async checkpointActiveCycle(
    asset?: AssetLike,
  ): Promise<CheckpointAcceptedResponse | undefined> {
    const address = assetAddress(asset);
    const cycle = await this.ctx.activeCycle(address);
    return this.checkpointCycle(address, cycle.id);
  }

  /**
   * Sign and submit a checkpoint covering the payer's outstanding payments in
   * `cycleId` — such as the cycle a `CHECKPOINT_REQUIRED` refusal names.
   * `undefined` when there is nothing to cover.
   *
   * Core's batch is checked before it is signed: every payment must be one
   * the payer signed, in this cycle and asset, past the previous checkpoint,
   * and counted once.
   */
  async checkpointCycle(
    asset: AssetLike,
    cycleId: string,
  ): Promise<CheckpointAcceptedResponse | undefined> {
    const address = assetAddress(asset);
    try {
      return await this.signAndSubmitCheckpoint(address, cycleId);
    } catch (err) {
      // Only once: a payer paid faster than a round trip would chase the
      // batch forever.
      if (err instanceof CheckpointMismatchError) {
        return this.signAndSubmitCheckpoint(address, cycleId);
      }
      throw err;
    }
  }

  private async signAndSubmitCheckpoint(
    asset: string,
    cycleId: string,
  ): Promise<CheckpointAcceptedResponse | undefined> {
    const batch = await this.checkpointBatchForCycle(asset, cycleId);
    const payload = await checkpointPayload(
      this.ctx.signerAddress,
      asset,
      cycleId,
      this.ctx.clearingHouseDomain,
      batch,
    );
    if (payload === undefined) return undefined;
    const signed = await this.ctx.payerSigner.signCheckpoint(
      this.ctx.clearingHouseDomain,
      payload,
    );
    return this.submitCheckpoint(signed);
  }

  /**
   * The timestamp to stamp a payment with, never at or before what a
   * checkpoint already covers.
   */
  private async nextPaymentTimestamp(asset: string): Promise<number> {
    const cutoff = this.ctx.paymentCutoff(asset);
    if (cutoff === undefined) return this.ctx.coreNow();
    const pastCutoffMs = (cutoff + 1) * 1000;
    for (;;) {
      const nowMs = this.ctx.coreNowMs();
      if (nowMs >= pastCutoffMs) return Math.floor(nowMs / 1000);
      await sleep(pastCutoffMs - nowMs);
    }
  }

  // --- recipient ---------------------------------------------------------

  /** Redeem a payer's signed request for the operator's guarantee receipt. */
  async issueGuarantee(request: PaymentRequest): Promise<GuaranteeReceipt> {
    try {
      return await this.ctx.rpc.issueGuarantee(request);
    } catch (err) {
      throw this.classify(err, request.payload.assetAddress);
    }
  }

  /**
   * Check that `receipt` was issued by the operator this client trusts,
   * returning the guarantee it attests. Offline.
   *
   * @throws {@link ReceiptSignerMismatchError} if someone else signed it.
   * @throws {@link MalformedReceiptError} if the receipt does not decode.
   */
  async verifyGuarantee(receipt: GuaranteeReceipt): Promise<Guarantee> {
    return verifyGuaranteeReceipt(
      receipt,
      this.ctx.guaranteeDomain,
      this.ctx.guaranteeSigner,
    );
  }

  /** Payments guaranteed to the signer as a recipient. */
  async listReceived(): Promise<RecipientPaymentInfo[]> {
    return this.ctx.rpc.listRecipientPayments(this.ctx.signerAddress);
  }

  // --- core's view -------------------------------------------------------

  /** The cycle payments for `asset` must be signed for right now, read fresh. */
  async activeCycle(asset?: AssetLike): Promise<ActiveCycleResponse> {
    const cycle = await this.ctx.rpc.getActiveCycle(assetAddress(asset));
    this.ctx.recordCoreTime(cycle.serverTime);
    return cycle;
  }

  /**
   * The payer's latest checkpoint in `asset`'s active cycle and the payments
   * it does not cover yet.
   */
  async checkpointBatch(asset?: AssetLike): Promise<CheckpointBatchResponse> {
    return this.ctx.rpc.getCheckpointBatch(
      this.ctx.signerAddress,
      assetAddress(asset),
    );
  }

  /** The payer's latest checkpoint in `cycleId` and the payments it does not cover yet. */
  async checkpointBatchForCycle(
    asset: AssetLike,
    cycleId: string,
  ): Promise<CheckpointBatchResponse> {
    return this.ctx.rpc.getCheckpointBatch(
      this.ctx.signerAddress,
      assetAddress(asset),
      cycleId,
    );
  }

  /**
   * Submit a checkpoint the payer has already signed. Resubmitting one core
   * already accepted succeeds and covers nothing.
   */
  async submitCheckpoint(
    signed: SignedCheckpoint,
  ): Promise<CheckpointAcceptedResponse> {
    const asset = signed.payload.assetAddress;
    let accepted: CheckpointAcceptedResponse;
    try {
      accepted = await this.ctx.rpc.submitCheckpoint(signed);
    } catch (err) {
      throw this.classify(err, asset);
    }
    this.ctx.recordPaymentCutoff(asset, accepted.timestampCutoff);
    return accepted;
  }

  /**
   * Turn core's coded refusals into typed errors, and refresh what they
   * prove stale. A refusal whose details do not decode stays the plain RPC
   * error.
   */
  private classify(err: unknown, asset: string): unknown {
    if (!(err instanceof RpcError) || err.code === undefined) return err;
    const options = { status: err.status, body: err.body, code: err.code };
    switch (err.code) {
      case "CYCLE_MISMATCH": {
        this.ctx.forgetActiveCycle(asset);
        const details = parseCycleMismatchDetails(err.details);
        if (!details) return err;
        this.ctx.recordCoreTime(details.serverTime);
        return new CycleMismatchError(details, options);
      }
      case "FUTURE_TIMESTAMP": {
        const details = parseFutureTimestampDetails(err.details);
        if (!details) return err;
        this.ctx.recordCoreTime(details.serverTime);
        return new FutureTimestampError(details, options);
      }
      case "STALE_TIMESTAMP": {
        const details = parseStaleTimestampDetails(err.details);
        if (!details) return err;
        this.ctx.recordCoreTime(details.serverTime);
        return new StaleTimestampError(details, options);
      }
      case "TIMESTAMP_NOT_PAST_CUTOFF": {
        const details = parseTimestampNotPastCutoffDetails(err.details);
        if (!details) return err;
        this.ctx.recordCoreTime(details.serverTime);
        // A cutoff belongs to the payer it names. Issuance is the recipient's
        // call, so the refusal often describes someone else, and holding back
        // this client's own payments for a stranger's cutoff would be nothing
        // but a delay.
        if (sameAddress(details.payer, this.ctx.signerAddress)) {
          this.ctx.recordPaymentCutoff(asset, details.timestampCutoff);
        }
        return new TimestampNotPastCutoffError(details, options);
      }
      case "CHECKPOINT_REQUIRED": {
        const details = parseCheckpointRequiredDetails(err.details);
        if (!details) return err;
        return new CheckpointRequiredError(details, options);
      }
      case "CHECKPOINT_MISMATCH": {
        const details = parseCheckpointMismatchDetails(err.details);
        if (!details) return err;
        const reason = err.message.replace(/^\d+: /, "");
        return new CheckpointMismatchError(details, reason, options);
      }
      default:
        return err;
    }
  }
}

function sameAddress(a: string, b: string): boolean {
  try {
    return normalizeAddress(a) === normalizeAddress(b);
  } catch {
    return false;
  }
}

async function digestOrUntrusted(
  what: string,
  digest: () => `0x${string}`,
): Promise<`0x${string}`> {
  try {
    return digest();
  } catch (err) {
    if (err instanceof InvalidParamsError || err instanceof ValidationError) {
      throw new UntrustedCheckpointBatchError(`${what}: ${err.message}`);
    }
    throw err;
  }
}

/**
 * The checkpoint that covers `batch`, or `undefined` when it covers nothing
 * new. Throws {@link UntrustedCheckpointBatchError} rather than sign over a
 * batch that does not add up: an operator that slipped in a payment the payer
 * never signed, or a forged previous total, would inflate what the payer can
 * be charged on default.
 */
export async function checkpointPayload(
  payer: string,
  asset: string,
  cycleId: string,
  domain: FourMicaEip712Domain,
  batch: CheckpointBatchResponse,
): Promise<CheckpointPayload | undefined> {
  if (batch.authorizations.length === 0) return undefined;

  const payerAddress = normalizeAddress(payer);
  const assetAddr = normalizeAddress(asset);
  const cycle = normalizeBytes32Hex(cycleId);

  if (batch.cycleId !== cycle) {
    throw new UntrustedCheckpointBatchError(
      `batch is for cycle ${batch.cycleId}, not ${cycle}`,
    );
  }
  if (!sameAddress(batch.assetAddress, assetAddr)) {
    throw new UntrustedCheckpointBatchError(
      `batch is for asset ${batch.assetAddress}, not ${assetAddr}`,
    );
  }

  let cumulativeGross = 0n;
  let previousCutoff = 0;
  if (batch.previous !== undefined) {
    const previous = batch.previous.payload;
    if (
      !sameAddress(previous.payer, payerAddress) ||
      previous.cycleId !== cycle ||
      !sameAddress(previous.assetAddress, assetAddr)
    ) {
      throw new UntrustedCheckpointBatchError(
        "previous checkpoint is for another payer, cycle or asset",
      );
    }
    const digest = await digestOrUntrusted("previous checkpoint", () =>
      previous.signingDigest(domain),
    );
    if (
      (await recoverSigner(digest, batch.previous.signature)) !== payerAddress
    ) {
      throw new UntrustedCheckpointBatchError(
        "previous checkpoint is not signed by the payer",
      );
    }
    cumulativeGross = previous.cumulativeGross;
    previousCutoff = previous.timestampCutoff;
  }

  const reqIds = new Set<bigint>();
  let timestampCutoff = previousCutoff;
  for (const authorization of batch.authorizations) {
    const payment = authorization.payload;
    const reqId = payment.reqId;
    if (
      !sameAddress(payment.userAddress, payerAddress) ||
      payment.cycleId !== cycle ||
      !sameAddress(payment.assetAddress, assetAddr)
    ) {
      throw new UntrustedCheckpointBatchError(
        `authorization ${reqId} is for another payer, cycle or asset`,
      );
    }
    const digest = await digestOrUntrusted(`authorization ${reqId}`, () =>
      payment.signingDigest(domain),
    );
    if (
      (await recoverSigner(digest, authorization.signature)) !== payerAddress
    ) {
      throw new UntrustedCheckpointBatchError(
        `authorization ${reqId} is not signed by the payer`,
      );
    }
    if (payment.timestamp <= previousCutoff) {
      throw new UntrustedCheckpointBatchError(
        `authorization ${reqId} is already covered by the previous checkpoint`,
      );
    }
    if (reqIds.has(reqId)) {
      throw new UntrustedCheckpointBatchError(
        `authorization ${reqId} appears twice`,
      );
    }
    reqIds.add(reqId);

    cumulativeGross += payment.amount;
    if (cumulativeGross > U256_MAX) {
      throw new InvalidParamsError("cumulative gross overflows");
    }
    timestampCutoff = Math.max(timestampCutoff, payment.timestamp);
  }

  return new CheckpointPayload({
    payer: payerAddress,
    cycleId: cycle,
    assetAddress: batch.assetAddress,
    cumulativeGross,
    timestampCutoff,
  });
}
