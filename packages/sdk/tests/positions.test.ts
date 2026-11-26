/**
 * Core's two listings for a wallet: the positions it can still settle, and
 * the guarantees it issued in a cycle. The wire shapes are the ones
 * `crates/rpc/src/core.rs` in 4mica-core serializes.
 */
import { describe, expect, it } from "vitest";
import { InvalidParamsError, RpcError } from "@/errors";
import { RpcProxy } from "@/rpc";
import { MockCore, ok, PAYER } from "./helpers/core";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const SELLER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const CYCLE_ID = `0x${"ab".repeat(32)}`;
const CYCLE_TEXT = `${USDC.toLowerCase()}:1767225600`;

const debit = {
  cycle_id: CYCLE_ID,
  cycle_id_text: CYCLE_TEXT,
  asset_address: USDC.toLowerCase(),
  role: "NET_DEBTOR",
  amount: "2500000",
  gross_outgoing: "4000000",
  gross_incoming: "1500000",
  payment_submission_deadline: 1_767_312_000,
  payment_finality_deadline: 1_767_398_400,
  commit_confirmed: true,
};

const proxy = (core: MockCore) =>
  new RpcProxy("https://core.example", core.fetch).withBearerToken("token");

describe("listParticipantPositions", () => {
  const path = `/core/participants/${PAYER.address}/positions`;

  it("reads each position's cycle, role, amounts and deadlines", async () => {
    const core = new MockCore({
      [`GET ${path}`]: () =>
        ok({ participant: PAYER.address, positions: [debit] }),
    });
    const [position, ...rest] = await proxy(core).listParticipantPositions(
      PAYER.address,
    );
    expect(rest).toEqual([]);
    expect(position).toMatchObject({
      cycleId: CYCLE_ID,
      // The id the settlement calls take.
      cycleIdText: CYCLE_TEXT,
      assetAddress: USDC,
      role: "NET_DEBTOR",
      amount: 2_500_000n,
      grossOutgoing: 4_000_000n,
      grossIncoming: 1_500_000n,
      paymentSubmissionDeadline: 1_767_312_000,
      paymentFinalityDeadline: 1_767_398_400,
      commitConfirmed: true,
    });
    // Asked with the wallet's session, like every per-address read.
    expect(core.requests[0].headers.get("authorization")).toBe("Bearer token");
  });

  it("is an empty list for a wallet with nothing to settle", async () => {
    const core = new MockCore({
      [`GET ${path}`]: () => ok({ participant: PAYER.address, positions: [] }),
    });
    expect(await proxy(core).listParticipantPositions(PAYER.address)).toEqual(
      [],
    );
  });

  it("refuses a position it cannot read rather than guess at it", async () => {
    const core = new MockCore({
      [`GET ${path}`]: () =>
        ok({ positions: [{ ...debit, cycle_id: "not-a-hash" }] }),
    });
    await expect(
      proxy(core).listParticipantPositions(PAYER.address),
    ).rejects.toBeInstanceOf(InvalidParamsError);
  });

  it.each([
    ["a role it does not know", { role: "FLAT" }, /unknown role FLAT/],
    ["no role", { role: undefined }, /missing role/],
    ["no amount", { amount: undefined }, /missing amount/],
    [
      "no payment deadline",
      { payment_submission_deadline: undefined },
      /missing payment_submission_deadline/,
    ],
    [
      "a finality deadline of zero",
      { payment_finality_deadline: 0 },
      /payment_finality_deadline is not a time/,
    ],
    [
      "no word on the commit",
      { commit_confirmed: undefined },
      /missing commit_confirmed/,
    ],
  ])("refuses a position with %s", async (_what, override, message) => {
    const core = new MockCore({
      [`GET ${path}`]: () => ok({ positions: [{ ...debit, ...override }] }),
    });
    const refusal = await proxy(core)
      .listParticipantPositions(PAYER.address)
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(refusal).toBeInstanceOf(InvalidParamsError);
    expect((refusal as Error).message).toMatch(message);
  });

  it("passes core's refusal on, as when asking for another wallet's", async () => {
    const core = new MockCore({
      [`GET ${path}`]: () => ({
        status: 401,
        json: { error: "user address does not match token subject" },
      }),
    });
    const refusal = await proxy(core)
      .listParticipantPositions(PAYER.address)
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(refusal).toBeInstanceOf(RpcError);
    expect(refusal).toMatchObject({ status: 401 });
  });
});

describe("listPayerGuarantees", () => {
  const path = `/core/payers/${PAYER.address}/guarantees`;
  const guarantee = (reqId: string, status = "NETTED") => ({
    guarantee_id: `g-${reqId}`,
    recipient: SELLER.toLowerCase(),
    req_id: reqId,
    amount: "100000",
    timestamp: 1_767_225_700,
    status,
  });
  const page = (guarantees: unknown[], next?: string) => ({
    cycle_id: CYCLE_ID,
    cycle_id_text: CYCLE_TEXT,
    asset_address: USDC.toLowerCase(),
    payer: PAYER.address.toLowerCase(),
    guarantees,
    ...(next ? { next_cursor: next } : {}),
  });

  it("asks for one cycle by its on-chain id, and reads what was issued", async () => {
    const core = new MockCore({
      [`GET ${path}`]: () => ok(page([guarantee("42", "SETTLED")])),
    });
    const listed = await proxy(core).listPayerGuarantees(
      PAYER.address,
      CYCLE_ID,
    );
    expect(core.requests[0].url.searchParams.get("cycle_id")).toBe(CYCLE_ID);
    // Left to core's default page size unless asked.
    expect(core.requests[0].url.searchParams.has("limit")).toBe(false);
    expect(listed).toMatchObject({
      cycleId: CYCLE_ID,
      cycleIdText: CYCLE_TEXT,
      assetAddress: USDC,
      payer: PAYER.address,
      nextCursor: undefined,
    });
    expect(listed.guarantees).toEqual([
      {
        guaranteeId: "g-42",
        recipient: SELLER,
        reqId: 42n,
        amount: 100_000n,
        timestamp: 1_767_225_700,
        status: "SETTLED",
      },
    ]);
  });

  it("pages with the cursor core hands back", async () => {
    const core = new MockCore({
      [`GET ${path}`]: ({ url }) =>
        url.searchParams.get("after") === "cursor-1"
          ? ok(page([guarantee("2")]))
          : ok(page([guarantee("1")], "cursor-1")),
    });
    const rpc = proxy(core);
    const first = await rpc.listPayerGuarantees(PAYER.address, CYCLE_ID, {
      limit: 1,
    });
    expect(core.requests[0].url.searchParams.get("limit")).toBe("1");
    expect(first.nextCursor).toBe("cursor-1");

    const second = await rpc.listPayerGuarantees(PAYER.address, CYCLE_ID, {
      limit: 1,
      after: first.nextCursor,
    });
    expect(second.guarantees.map((g) => g.reqId)).toEqual([2n]);
    // The last page has no cursor: nothing follows.
    expect(second.nextCursor).toBeUndefined();
  });

  it("refuses a cycle id that is not one before asking core", async () => {
    const core = new MockCore({});
    await expect(
      proxy(core).listPayerGuarantees(PAYER.address, CYCLE_TEXT),
    ).rejects.toThrow();
    expect(core.requests).toEqual([]);
  });

  it("keeps a status newer than this SDK as core sent it", async () => {
    const core = new MockCore({
      [`GET ${path}`]: () => ok(page([guarantee("7", "SOMETHING_NEW")])),
    });
    const { guarantees } = await proxy(core).listPayerGuarantees(
      PAYER.address,
      CYCLE_ID,
    );
    expect(guarantees[0].status).toBe("SOMETHING_NEW");
  });
});
