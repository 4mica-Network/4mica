/**
 * How the payment client reacts to core's coded refusals, what it caches
 * between payments, and which cycle it checkpoints. Port of
 * `sdk-rust/tests/payment_errors.rs`.
 *
 * Offline against a mock core reached through the real `RpcProxy`, so error
 * bodies are decoded exactly as in production. The refusals are the payer's
 * whole recovery story — each must arrive as a typed error carrying what the
 * caller needs to act on, and several also settle what the client may keep
 * reusing.
 */

import { type Hex, recoverAddress } from "viem";
import { afterEach, describe, expect, it } from "vitest";
import type { Client } from "@/client";
import {
  CheckpointMismatchError,
  CheckpointRequiredError,
  CoreRefusalError,
  CycleMismatchError,
  FutureTimestampError,
  RpcError,
  StaleTimestampError,
  TimestampNotPastCutoffError,
} from "@/errors";
import { clearingHouseDomain } from "@/guarantee";
import {
  CheckpointPayload,
  PaymentRequestPayload,
  SignedCheckpoint,
} from "@/models";
import {
  CLEARING_HOUSE_ADDRESS,
  type CoreHandler,
  connect,
  MOCK_CORE_CHAIN_ID,
  MockCore,
  ok,
  PAYER,
} from "./helpers/core";

const ZERO = "0x0000000000000000000000000000000000000000";
const RECIPIENT = "0x00000000000000000000000000000000000000Be";
const STRANGER = "0x00000000000000000000000000000000000000aA";
const FIRST_CYCLE = `0x${"11".repeat(32)}`;
const NEXT_CYCLE = `0x${"22".repeat(32)}`;
const DOMAIN = clearingHouseDomain(MOCK_CORE_CHAIN_ID, CLEARING_HOUSE_ADDRESS);

const unixNow = () => Math.floor(Date.now() / 1000);

/** A cycle still open for the next day unless told otherwise. */
const activeCycle = (cycleId: string, periodEnd = unixNow() + 86_400) => ({
  cycle_id: cycleId,
  cycle_id_text: "0x0:1700000000",
  asset_address: ZERO,
  period_start: 1_700_000_000,
  period_end: periodEnd,
});

/** The active cycle as a core whose clock reads `serverTime` reports it. */
const activeCycleAt = (serverTime: number, periodStart: number) => ({
  ...activeCycle(FIRST_CYCLE, serverTime + 86_400),
  period_start: periodStart,
  server_time: serverTime,
});

const refusing =
  (body: unknown, status = 409): CoreHandler =>
  () => ({ status, json: body });

/**
 * The first read reports FIRST_CYCLE and every later one NEXT_CYCLE, so a
 * test can tell a cached answer from a fresh one.
 */
function cycleReadsAlternating(): CoreHandler {
  let reads = 0;
  return () => {
    reads += 1;
    return ok(activeCycle(reads === 1 ? FIRST_CYCLE : NEXT_CYCLE));
  };
}

/** A core that always serves a cycle and always refuses issuance. */
async function clientRefusingWith(body: unknown, status = 409) {
  const core = new MockCore({
    "GET /core/cycles/active": cycleReadsAlternating(),
    "POST /core/guarantees": refusing(body, status),
  });
  return { client: await connect(core), core };
}

async function refused(client: Client): Promise<unknown> {
  const payload = await client.payment.newPayment(RECIPIENT, 10n);
  const request = await client.payment.signRequest(payload);
  return client.payment.issueGuarantee(request).then(
    () => {
      throw new Error("core refuses every issuance here");
    },
    (err: unknown) => err,
  );
}

const cutoffRefusal = (payer: string, cutoff: number, serverTime: number) => ({
  error: "request timestamp must be past the payer's latest checkpoint cutoff",
  code: "TIMESTAMP_NOT_PAST_CUTOFF",
  details: {
    cycle_id: FIRST_CYCLE,
    cycle_id_text: "0x0:1700000000",
    asset_address: ZERO,
    payer,
    timestamp: cutoff,
    timestamp_cutoff: cutoff,
    cumulative_gross: "500",
    server_time: serverTime,
  },
});

afterEach(() => {
  // connect() stubs the global fetch.
  globalThis.fetch = fetch;
});

describe("coded refusals", () => {
  it("names what is outstanding when a checkpoint is required", async () => {
    const { client } = await clientRefusingWith({
      error:
        "payer must submit a checkpoint before more guarantees are accepted",
      code: "CHECKPOINT_REQUIRED",
      details: {
        cycle_id: FIRST_CYCLE,
        cycle_id_text: "0x0:1700000000",
        asset_address: ZERO,
        payer: RECIPIENT,
        uncheckpointed: 64,
        max_uncheckpointed: 64,
      },
    });

    const err = await refused(client);
    expect(err).toBeInstanceOf(CheckpointRequiredError);
    const details = (err as CheckpointRequiredError).details;
    expect(details.uncheckpointed).toBe(64);
    expect(details.maxUncheckpointed).toBe(64);
    expect(details.cycleId).toBe(FIRST_CYCLE);
  });

  it("names the cutoff a payment fell behind", async () => {
    const { client } = await clientRefusingWith(
      cutoffRefusal(RECIPIENT, 1_700_000_000, 1_700_000_001),
    );

    const err = await refused(client);
    expect(err).toBeInstanceOf(TimestampNotPastCutoffError);
    const details = (err as TimestampNotPastCutoffError).details;
    expect(details.timestampCutoff).toBe(1_700_000_000);
    expect(details.cumulativeGross).toBe(500n);
  });

  it("holds the payer's next payment past its own cutoff", async () => {
    // The cutoff comes back with the refusal, and the client keeps it so the
    // next payment is stamped past it rather than repeating the mistake.
    const cutoff = unixNow();
    const { client } = await clientRefusingWith(
      cutoffRefusal(PAYER.address.toLowerCase(), cutoff, cutoff),
    );

    expect(await refused(client)).toBeInstanceOf(TimestampNotPastCutoffError);
    const next = await client.payment.newPayment(RECIPIENT, 10n);
    expect(next.timestamp).toBeGreaterThan(cutoff);
  });

  it("does not hold this client back for another payer's cutoff", async () => {
    // Issuance is the recipient's call, so a cutoff refusal usually names a
    // payer this client is not.
    const farFuture = unixNow() + 3_600;
    const { client } = await clientRefusingWith(
      cutoffRefusal(STRANGER, farFuture, unixNow()),
    );

    expect(await refused(client)).toBeInstanceOf(TimestampNotPastCutoffError);
    const started = Date.now();
    await client.payment.newPayment(RECIPIENT, 10n);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("expires the cached cycle on a cycle mismatch", async () => {
    // A cycle is held until core rejects a payment signed against it, so
    // the next payment is scoped to the cycle core will actually accept.
    const { client, core } = await clientRefusingWith({
      error:
        "request was signed for a cycle other than the active settlement cycle",
      code: "CYCLE_MISMATCH",
      details: {
        signed_cycle_id: FIRST_CYCLE,
        active_cycle_id: NEXT_CYCLE,
        active_cycle_id_text: "0x0:1700086400",
        active_period_end: 1_700_172_800,
      },
    });

    const first = await client.payment.newPayment(RECIPIENT, 10n);
    const second = await client.payment.newPayment(RECIPIENT, 10n);
    expect(first.cycleId).toBe(FIRST_CYCLE);
    expect(second.cycleId).toBe(FIRST_CYCLE);
    expect(core.count("GET", "/core/cycles/active")).toBe(1);

    const err = await refused(client);
    expect(err).toBeInstanceOf(CycleMismatchError);
    expect((err as CycleMismatchError).details.activeCycleId).toBe(NEXT_CYCLE);

    const after = await client.payment.newPayment(RECIPIENT, 10n);
    expect(after.cycleId).toBe(NEXT_CYCLE);
  });

  it("reports core's clock on a future timestamp and stamps by it", async () => {
    const coreTime = unixNow() - 3_600;
    const { client } = await clientRefusingWith({
      error: "request timestamp is later than the server clock",
      code: "FUTURE_TIMESTAMP",
      details: { timestamp: unixNow(), server_time: coreTime },
    });

    const err = await refused(client);
    expect(err).toBeInstanceOf(FutureTimestampError);
    expect((err as FutureTimestampError).details.serverTime).toBe(coreTime);

    const next = await client.payment.newPayment(RECIPIENT, 10n);
    expect(next.timestamp).toBeLessThanOrEqual(coreTime + 1);
  });

  it("names the cycle a stale timestamp missed", async () => {
    const { client } = await clientRefusingWith({
      error: "request timestamp is before the active cycle started",
      code: "STALE_TIMESTAMP",
      details: {
        cycle_id: FIRST_CYCLE,
        cycle_id_text: "0x0:1700000000",
        timestamp: 1_699_999_999,
        period_start: 1_700_000_000,
        period_end: 1_700_086_400,
        server_time: unixNow(),
      },
    });

    const err = await refused(client);
    expect(err).toBeInstanceOf(StaleTimestampError);
    expect((err as StaleTimestampError).details.periodStart).toBe(
      1_700_000_000,
    );
    expect((err as StaleTimestampError).details.cycleId).toBe(FIRST_CYCLE);
  });

  it("keeps an uncoded refusal a plain RPC error", async () => {
    const { client } = await clientRefusingWith({
      error: "another guarantee with req_id 7 already exists",
    });

    const err = await refused(client);
    expect(err).toBeInstanceOf(RpcError);
    expect(err).not.toBeInstanceOf(CoreRefusalError);
    expect(String(err)).toContain("already exists");
    expect((err as RpcError).status).toBe(409);
  });

  it("keeps a coded refusal with unreadable details a plain RPC error", async () => {
    const { client } = await clientRefusingWith({
      error: "checkpoint required",
      code: "CHECKPOINT_REQUIRED",
      details: {},
    });

    const err = await refused(client);
    expect(err).not.toBeInstanceOf(CoreRefusalError);
    expect((err as RpcError).code).toBe("CHECKPOINT_REQUIRED");
  });

  it("keeps typed refusals catchable as RPC errors", async () => {
    const { client } = await clientRefusingWith(
      {
        error: "request timestamp is later than the server clock",
        code: "FUTURE_TIMESTAMP",
        details: { timestamp: unixNow(), server_time: unixNow() },
      },
      400,
    );

    const err = await refused(client);
    expect(err).toBeInstanceOf(CoreRefusalError);
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).status).toBe(400);
    expect((err as RpcError).code).toBe("FUTURE_TIMESTAMP");
  });

  it("posts the tagged payload and the payer's signature", async () => {
    const { client, core } = await clientRefusingWith({ error: "nope" });
    await refused(client);

    const post = core.requests.find((request) => request.method === "POST");
    const body = post?.body as {
      payload: Record<string, unknown>;
      signature: Hex;
    };
    expect(Object.keys(body).sort()).toEqual(["payload", "signature"]);
    expect(body.payload.version).toBe("v1");
    expect(body.payload.cycle_id).toBe(FIRST_CYCLE);
    expect(body.payload.user_address).toBe(PAYER.address);
    expect(post?.headers.get("authorization")).toBe("Bearer test-token");

    const payload = PaymentRequestPayload.fromRpc(body.payload);
    await expect(
      recoverAddress({
        hash: payload.signingDigest(DOMAIN),
        signature: body.signature,
      }),
    ).resolves.toBe(PAYER.address);
  });
});

describe("the active cycle", () => {
  it("is re-read once its period ends", async () => {
    const core = new MockCore({
      "GET /core/cycles/active": () =>
        ok(activeCycle(FIRST_CYCLE, unixNow() - 1)),
    });
    const client = await connect(core);

    await client.payment.newPayment(RECIPIENT, 10n);
    await client.payment.newPayment(RECIPIENT, 10n);
    expect(core.count("GET", "/core/cycles/active")).toBe(2);
  });

  it("is cached per asset", async () => {
    const core = new MockCore({
      "GET /core/cycles/active": () => ok(activeCycle(FIRST_CYCLE)),
    });
    const client = await connect(core);
    const token = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

    await client.payment.newPayment(RECIPIENT, 10n);
    await client.payment.newPayment(RECIPIENT, 10n, token);
    await client.payment.newPayment(RECIPIENT, 10n, token.toLowerCase());

    const assets = core.requests
      .filter((request) => request.url.pathname.endsWith("/active"))
      .map((request) => request.url.searchParams.get("asset"));
    expect(assets).toEqual([ZERO, token]);
  });

  it.each([
    3_600, -3_600,
  ])("stamps payments by core's clock when ours is %ss off", async (skew) => {
    const coreTime = unixNow() + skew;
    const core = new MockCore({
      "GET /core/cycles/active": () =>
        ok(activeCycleAt(coreTime, 1_700_000_000)),
    });
    const client = await connect(core);

    const { timestamp } = await client.payment.newPayment(RECIPIENT, 10n);
    expect(timestamp).toBeLessThanOrEqual(unixNow() + skew);
    expect(timestamp + 2).toBeGreaterThanOrEqual(coreTime);
  });

  it("never stamps a payment before the cycle it is signed for", async () => {
    // Core's clock as the client knows it is a truncated lower bound, so it
    // can read a moment before the cycle that is already open.
    const reported = unixNow();
    const opened = reported + 2;
    const core = new MockCore({
      "GET /core/cycles/active": () => ok(activeCycleAt(reported, opened)),
    });
    const client = await connect(core);

    const { timestamp } = await client.payment.newPayment(RECIPIENT, 10n);
    expect(timestamp).toBe(opened);
  });
});

describe("checkpoints", () => {
  it("each names the cycle it covers", async () => {
    const emptyBatch = {
      cycle_id: FIRST_CYCLE,
      cycle_id_text: "0x0:1700000000",
      asset_address: ZERO,
      payer: ZERO,
      previous: null,
      authorizations: [],
      max_uncheckpointed: 64,
    };
    const core = new MockCore({
      "GET /core/cycles/active": () => ok(activeCycle(NEXT_CYCLE)),
      "GET /core/payers/{payer}/checkpoint-batch": () => ok(emptyBatch),
    });
    const client = await connect(core);

    await expect(
      client.payment.checkpointActiveCycle(),
    ).resolves.toBeUndefined();
    await expect(
      client.payment.checkpointCycle(null, FIRST_CYCLE),
    ).resolves.toBeUndefined();

    const asked = core.requests.filter((request) =>
      request.url.pathname.endsWith("/checkpoint-batch"),
    );
    expect(asked).toHaveLength(2);
    expect(asked[0].url.pathname).toBe(
      `/core/payers/${PAYER.address}/checkpoint-batch`,
    );
    expect(asked[0].url.searchParams.get("cycle_id")).toBe(NEXT_CYCLE);
    expect(asked[1].url.searchParams.get("cycle_id")).toBe(FIRST_CYCLE);
    expect(asked[1].url.searchParams.get("asset")).toBe(ZERO);
  });

  /** A payment the payer signed in the first cycle, as core lists it. */
  async function signedPayment(amount: bigint, timestamp: number) {
    const payload = PaymentRequestPayload.new({
      userAddress: PAYER.address,
      recipientAddress: RECIPIENT,
      cycleId: FIRST_CYCLE,
      reqId: BigInt(timestamp),
      amount,
      timestamp,
      salt: `0x${"33".repeat(32)}`,
    });
    const signature = await PAYER.sign({ hash: payload.signingDigest(DOMAIN) });
    return { payload: payload.toPayload(), signature };
  }

  /**
   * A core where a second payment lands right after the payer first reads
   * its batch, and which refuses the first `refusals` checkpoints as stale.
   */
  async function coreRacingAPayment(refusals: number) {
    const first = await signedPayment(10n, 1_700_000_100);
    const late = await signedPayment(7n, 1_700_000_200);
    const submitted: SignedCheckpoint[] = [];
    let reads = 0;

    const core = new MockCore({
      "GET /core/payers/{payer}/checkpoint-batch": () => {
        reads += 1;
        return ok({
          cycle_id: FIRST_CYCLE,
          cycle_id_text: "0x0:1700000000",
          asset_address: ZERO,
          payer: PAYER.address,
          previous: null,
          authorizations: reads === 1 ? [first] : [first, late],
          max_uncheckpointed: 64,
        });
      },
      "POST /core/checkpoints": (request) => {
        const signed = SignedCheckpoint.fromRpc(request.body);
        submitted.push(signed);
        const checkpoint = signed.payload;
        if (submitted.length <= refusals) {
          return {
            status: 400,
            json: {
              error:
                "checkpoint cumulative gross does not match the covered authorizations",
              code: "CHECKPOINT_MISMATCH",
              details: {
                cycle_id: FIRST_CYCLE,
                cycle_id_text: "0x0:1700000000",
                asset_address: checkpoint.assetAddress,
                payer: checkpoint.payer,
              },
            },
          };
        }
        return ok({
          cycle_id: FIRST_CYCLE,
          cycle_id_text: "0x0:1700000000",
          asset_address: checkpoint.assetAddress,
          payer: checkpoint.payer,
          cumulative_gross: checkpoint.cumulativeGross.toString(),
          timestamp_cutoff: checkpoint.timestampCutoff,
          covered: 2,
        });
      },
    });
    return { core, submitted, reads: () => reads };
  }

  it("signs again when a payment overtakes it", async () => {
    // A payment landing mid-checkpoint makes the first one stale; the retry
    // re-reads the batch and covers the late payment too.
    const { core, submitted, reads } = await coreRacingAPayment(1);
    const client = await connect(core);

    const accepted = await client.payment.checkpointCycle(null, FIRST_CYCLE);
    expect(accepted?.cumulativeGross).toBe(17n);
    expect(accepted?.timestampCutoff).toBe(1_700_000_200);
    expect(reads()).toBe(2);
    expect(submitted.map((s) => s.payload.cumulativeGross)).toEqual([10n, 17n]);
    for (const signed of submitted) {
      await expect(
        recoverAddress({
          hash: signed.payload.signingDigest(DOMAIN),
          signature: signed.signature as Hex,
        }),
      ).resolves.toBe(PAYER.address);
    }
  });

  it("reports the mismatch when refused twice", async () => {
    // A payer paid faster than it can checkpoint gets the refusal back
    // rather than an endless retry.
    const { core, submitted } = await coreRacingAPayment(1_000);
    const client = await connect(core);

    const err = await client.payment
      .checkpointCycle(null, FIRST_CYCLE)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CheckpointMismatchError);
    expect((err as CheckpointMismatchError).details.cycleId).toBe(FIRST_CYCLE);
    expect((err as CheckpointMismatchError).reason).toContain(
      "cumulative gross",
    );
    expect(submitted).toHaveLength(2);
  });

  it("holds the next payment past an accepted cutoff", async () => {
    // A payment stamped at or before an accepted cutoff could never be
    // collected, so the next one waits until it can be stamped past it.
    const cutoff = unixNow();
    const core = new MockCore({
      "GET /core/cycles/active": () => ok(activeCycle(FIRST_CYCLE)),
      "POST /core/checkpoints": () =>
        ok({
          cycle_id: FIRST_CYCLE,
          cycle_id_text: "0x0:1700000000",
          asset_address: ZERO,
          payer: PAYER.address,
          cumulative_gross: "10",
          timestamp_cutoff: cutoff,
          covered: 1,
        }),
    });
    const client = await connect(core);
    const signed = await client.ctx.payerSigner.signCheckpoint(
      DOMAIN,
      new CheckpointPayload({
        payer: PAYER.address,
        cycleId: FIRST_CYCLE,
        assetAddress: ZERO,
        cumulativeGross: 10n,
        timestampCutoff: cutoff,
      }),
    );

    await client.payment.submitCheckpoint(signed);
    const next = await client.payment.newPayment(RECIPIENT, 10n);
    expect(next.timestamp).toBeGreaterThan(cutoff);
  });
});
