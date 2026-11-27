/**
 * What a transaction the wallet sends itself is reported as when the chain's
 * node goes quiet. The gateway and viem are real; only the node is a stub,
 * so the errors are the ones viem actually raises.
 */
import { encodeErrorResult, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearingHouseAbi } from "@/abi/clearinghouse";
import { ContractGateway } from "@/contract";
import {
  ClaimExceedsFundedLiquidityError,
  ContractError,
  OutcomeUnknownError,
  RevertedOnChainError,
  TransactionOutcomeUnknownError,
} from "@/errors";

const CHAIN_ID = 1337;
const RPC = "https://rpc.example";
const TREASURY = "0x00000000000000000000000000000000C04E4a1c" as Hex;
const TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
// anvil's account #0.
const SIGNER = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const HASH = `0x${"cd".repeat(32)}`;
const WORD = `0x${"00".repeat(32)}`;

type Reply = { result: unknown } | { error: { code: number; message: string } };
type Handler = (params: unknown[]) => Reply | Response | Promise<never>;

/** A node that answers what a send needs, and whatever a test overrides. */
function node(overrides: Record<string, Handler> = {}) {
  const calls: { method: string; params: unknown[] }[] = [];
  const handlers: Record<string, Handler> = {
    eth_chainId: () => ({ result: `0x${CHAIN_ID.toString(16)}` }),
    eth_getTransactionCount: () => ({ result: "0x0" }),
    eth_estimateGas: () => ({ result: "0x186a0" }),
    eth_blockNumber: () => ({ result: "0x1" }),
    eth_getBlockByNumber: () => ({
      result: { number: "0x1", baseFeePerGas: "0x3b9aca00" },
    }),
    eth_maxPriorityFeePerGas: () => ({ result: "0x3b9aca00" }),
    eth_sendRawTransaction: () => ({ result: HASH }),
    eth_getTransactionReceipt: () => ({ result: null }),
    // An allowance of zero, for `approveErc20`'s own read.
    eth_call: () => ({ result: WORD }),
    ...overrides,
  };
  vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
    const { id, method, params } = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
      params: unknown[];
    };
    calls.push({ method, params });
    const reply = await (handlers[method] ?? (() => ({ result: null })))(
      params,
    );
    return reply instanceof Response
      ? reply
      : Response.json({ jsonrpc: "2.0", id, ...reply });
  });
  return {
    calls,
    /** The distinct signed transactions that were put on the wire. */
    broadcasts: () => [
      ...new Set(
        calls
          .filter((c) => c.method === "eth_sendRawTransaction")
          .map((c) => String(c.params[0])),
      ),
    ],
  };
}

const gateway = () => ContractGateway.create(RPC, SIGNER, TREASURY, CHAIN_ID);

/** How a dropped connection reaches `fetch`. */
const dropped = (): Promise<never> =>
  Promise.reject(new TypeError("fetch failed"));

/** A receipt as a node sends it. */
const receipt = (status: "0x0" | "0x1") => ({
  transactionHash: HASH,
  transactionIndex: "0x0",
  blockHash: WORD,
  blockNumber: "0x1",
  from: SIGNER.address,
  to: TREASURY,
  cumulativeGasUsed: "0x5208",
  gasUsed: "0x5208",
  effectiveGasPrice: "0x1",
  contractAddress: null,
  logs: [],
  logsBloom: `0x${"00".repeat(256)}`,
  status,
  type: "0x2",
});

afterEach(() => vi.unstubAllGlobals());

describe("a broadcast the node never answers", () => {
  it("is an unknown outcome, not a failed write, when the connection drops", async () => {
    const rpc = node({ eth_sendRawTransaction: dropped });
    const sent = (await gateway()).deposit(10n ** 16n);

    const error = await sent.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TransactionOutcomeUnknownError);
    // One check covers every unknown outcome, sponsored or not.
    expect(error).toBeInstanceOf(OutcomeUnknownError);
    expect(error).not.toBeInstanceOf(ContractError);
    expect(error).toMatchObject({ stage: "broadcast", txHash: undefined });
    expect((error as Error).message).toMatch(
      /^deposit: the transaction was sent and no usable answer came back/,
    );
    // One signed transaction went out, and it was not sent again.
    expect(rpc.broadcasts()).toHaveLength(1);
    expect(
      rpc.calls.filter((c) => c.method === "eth_sendRawTransaction"),
    ).toHaveLength(1);
  });

  it("is an unknown outcome when a gateway answers in the node's place", async () => {
    node({
      eth_sendRawTransaction: () =>
        new Response("<html>bad gateway</html>", { status: 502 }),
    });
    await expect((await gateway()).deposit(10n ** 16n)).rejects.toMatchObject({
      name: "TransactionOutcomeUnknownError",
      stage: "broadcast",
    });
  });

  it("is an unknown outcome when whoever was asked gave up waiting (HTTP 408)", async () => {
    node({
      eth_sendRawTransaction: () =>
        new Response("request timeout", { status: 408 }),
    });
    await expect((await gateway()).deposit(10n ** 16n)).rejects.toMatchObject({
      name: "TransactionOutcomeUnknownError",
      stage: "broadcast",
    });
  });

  it("is an unknown outcome when the node answers with an internal error", async () => {
    // -32603 is the node, or the provider in front of it, failing at its own
    // work: an upstream timeout comes back this way, and says nothing of the
    // transaction.
    node({
      eth_sendRawTransaction: () => ({
        error: { code: -32603, message: "upstream request timeout" },
      }),
    });
    const error = await (await gateway()).deposit(10n ** 16n).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TransactionOutcomeUnknownError);
    expect(error).toMatchObject({ stage: "broadcast", txHash: undefined });
  });

  it("stays a failed write when an internal error came before the broadcast", async () => {
    const rpc = node({
      eth_estimateGas: () => ({
        error: { code: -32603, message: "internal error" },
      }),
    });
    const error = await (await gateway()).deposit(10n ** 16n).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ContractError);
    expect(error).not.toBeInstanceOf(OutcomeUnknownError);
    expect(rpc.broadcasts()).toEqual([]);
  });

  it("stays a failed write when the node refuses the transaction", async () => {
    node({
      eth_sendRawTransaction: () => ({
        error: { code: -32000, message: "nonce too low" },
      }),
    });
    const error = await (await gateway()).deposit(10n ** 16n).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ContractError);
    expect(error).not.toBeInstanceOf(OutcomeUnknownError);
    expect((error as Error).message).toContain("deposit failed");
  });

  it("stays a failed write when the node's gatekeeper turns the request away", async () => {
    node({
      eth_sendRawTransaction: () =>
        new Response("rate limited", { status: 429 }),
    });
    await expect((await gateway()).deposit(10n ** 16n)).rejects.toBeInstanceOf(
      ContractError,
    );
  });

  it("stays a failed write when what failed came before the broadcast", async () => {
    // The gas estimate is asked for first; nothing is signed without it.
    const rpc = node({ eth_estimateGas: dropped });
    const error = await (await gateway()).deposit(10n ** 16n).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ContractError);
    expect(error).not.toBeInstanceOf(OutcomeUnknownError);
    expect(rpc.broadcasts()).toEqual([]);
  });
});

describe("a transaction the node accepted", () => {
  it("is an unknown outcome, with its hash, when no receipt comes in time", async () => {
    node();
    const error = await (await gateway())
      .deposit(10n ** 16n, undefined, { timeout: 300, pollingInterval: 50 })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(TransactionOutcomeUnknownError);
    expect(error).toMatchObject({ stage: "receipt", txHash: HASH });
    expect((error as Error).message).toContain(
      `transaction ${HASH} was sent, but its receipt was not seen`,
    );
  });

  it("is still a revert when the receipt says it reverted", async () => {
    node({ eth_getTransactionReceipt: () => ({ result: receipt("0x0") }) });
    await expect(
      (await gateway()).deposit(10n ** 16n, undefined, {
        timeout: 2_000,
        pollingInterval: 50,
      }),
    ).rejects.toBeInstanceOf(RevertedOnChainError);
  });

  it("is returned when it is mined", async () => {
    node({ eth_getTransactionReceipt: () => ({ result: receipt("0x1") }) });
    const mined = await (await gateway()).deposit(10n ** 16n, undefined, {
      timeout: 2_000,
      pollingInterval: 50,
    });
    expect(mined.transactionHash).toBe(HASH);
  });
});

describe("a clearing call that would revert", () => {
  // Both clearing calls carry a fixed gas limit, so viem estimates nothing:
  // without a run against the chain first, a revert is mined and paid for.
  const CLEARING_HOUSE = "0x00000000000000000000000000000000c1ea4196";
  const CYCLE = `0x${"aa".repeat(32)}` as Hex;
  const PROOF = [`0x${"dd".repeat(32)}`] as Hex[];
  const unfunded = () => ({
    error: {
      code: 3,
      message: "execution reverted",
      data: encodeErrorResult({
        abi: clearingHouseAbi,
        errorName: "ClaimExceedsFundedLiquidity",
        args: [2_500_000n, 1n],
      }),
    },
  });

  it("is refused with its typed revert, and never sent, for a claim", async () => {
    const rpc = node({ eth_call: unfunded });
    const error = await (await gateway())
      .claimNetCreditFor(
        CLEARING_HOUSE,
        SIGNER.address,
        CYCLE,
        2_500_000n,
        PROOF,
      )
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(ClaimExceedsFundedLiquidityError);
    expect(rpc.broadcasts()).toEqual([]);
  });

  it("is refused, and never sent, for a payment", async () => {
    const rpc = node({ eth_call: unfunded });
    await expect(
      (await gateway()).payNetDebit(CLEARING_HOUSE, CYCLE, 7n, PROOF, 7n),
    ).rejects.toBeInstanceOf(ContractError);
    expect(rpc.broadcasts()).toEqual([]);
  });

  it("is a failed write, not an unknown outcome, when the run itself gets no answer", async () => {
    const rpc = node({ eth_call: dropped });
    const error = await (await gateway())
      .claimNetCreditFor(CLEARING_HOUSE, SIGNER.address, CYCLE, 1n, PROOF)
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(ContractError);
    expect(error).not.toBeInstanceOf(OutcomeUnknownError);
    expect(rpc.broadcasts()).toEqual([]);
  });

  it("is sent once the run passes, as the wallet and with the payment's value", async () => {
    const rpc = node({
      eth_call: () => ({ result: "0x" }),
      eth_getTransactionReceipt: () => ({ result: receipt("0x1") }),
    });
    const mined = await (await gateway()).payNetDebit(
      CLEARING_HOUSE,
      CYCLE,
      7n,
      PROOF,
      7n,
      { timeout: 2_000, pollingInterval: 50 },
    );
    expect(mined.transactionHash).toBe(HASH);
    const run = rpc.calls.find((c) => c.method === "eth_call");
    expect(run?.params[0]).toMatchObject({
      from: SIGNER.address,
      to: CLEARING_HOUSE,
      value: "0x7",
    });
    expect(rpc.broadcasts()).toHaveLength(1);
    // The run comes before the broadcast.
    const methods = rpc.calls.map((c) => c.method);
    expect(methods.indexOf("eth_call")).toBeLessThan(
      methods.indexOf("eth_sendRawTransaction"),
    );
  });
});

describe("an approval that may be out", () => {
  it("is not followed by a reset and a second approval", async () => {
    // `approveErc20` retries a failed approval by resetting the allowance to
    // zero first, which some tokens need. A lost broadcast is not a failure:
    // retrying would put up to three transactions where one was meant.
    const rpc = node({ eth_sendRawTransaction: dropped });
    const error = await (await gateway()).approveErc20(TOKEN, 5_000_000n).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TransactionOutcomeUnknownError);
    expect(error).toMatchObject({ stage: "broadcast" });
    expect(rpc.broadcasts()).toHaveLength(1);
  });

  it("is not retried either when it was accepted and its receipt did not come", async () => {
    const rpc = node();
    const error = await (await gateway())
      .approveErc20(TOKEN, 5_000_000n, { timeout: 300, pollingInterval: 50 })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toMatchObject({ stage: "receipt", txHash: HASH });
    expect(rpc.broadcasts()).toHaveLength(1);
  });
});
