/**
 * What a transaction the wallet sends itself is reported as when the chain's
 * node goes quiet. The gateway and viem are real; only the node is a stub,
 * so the errors are the ones viem actually raises.
 */
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractGateway } from "@/contract";
import {
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
      /^deposit: the transaction was sent and the node's answer never came/,
    );
    // viem retried the same signed transaction; nothing new was signed.
    expect(rpc.broadcasts()).toHaveLength(1);
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
