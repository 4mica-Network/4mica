import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "../errors.js";
import { runCommand } from "../test/run.js";
import Deposit from "./deposit.js";

const mined = {
  status: "mined",
  txHash: "0xfeed",
  route: "gasless",
  amount: "5",
  amountRaw: 5_000_000n,
  asset: { symbol: "USDC", address: "0xToken", decimals: 6 },
  network: "eip155:84532",
  explorerUrl: "https://sepolia.basescan.org/tx/0xfeed",
  spendable: vi.fn(),
};
const client = { address: "0xWallet", deposit: vi.fn() };

vi.mock("../core/session.js", () => ({
  withSession: (_settings: unknown, use: (c: typeof client) => unknown) =>
    use(client),
}));

beforeEach(() => {
  client.deposit.mockResolvedValue(mined);
  mined.spendable.mockResolvedValue({ ...mined, status: "spendable" });
  process.exitCode = undefined;
});
afterEach(() => vi.clearAllMocks());

describe("deposit", () => {
  it("sends nothing when it cannot ask and --yes is absent", async () => {
    const { error } = await runCommand(Deposit, ["5", "--asset", "USDC"]);
    expect(error).toMatchObject({
      code: "CONFIRMATION_REQUIRED",
      oclif: { exit: EXIT.usage },
    });
    expect(client.deposit).not.toHaveBeenCalled();
  });

  it("rejects a bad amount before connecting or confirming", async () => {
    const { error } = await runCommand(Deposit, ["5", "--yes"]);
    expect(error).toMatchObject({ code: "NO_ASSET" });
    expect(client.deposit).not.toHaveBeenCalled();
  });

  it("gets the transaction mined first, then waits for core", async () => {
    const { json, error } = await runCommand(Deposit, [
      "5",
      "--asset",
      "USDC",
      "--timeout",
      "7",
      "--yes",
      "--json",
    ]);
    expect(error).toBeUndefined();
    expect(client.deposit).toHaveBeenCalledWith(
      { amount: "5", asset: "USDC" },
      { gas: "auto", wait: "mined" },
    );
    expect(mined.spendable).toHaveBeenCalledWith({ timeoutMs: 7000 });
    expect(json).toMatchObject({
      status: "spendable",
      txHash: "0xfeed",
      amountRaw: "5000000",
    });
  });

  it("reports a timed-out wait as pending and still succeeds", async () => {
    mined.spendable.mockResolvedValue({ ...mined, status: "pending" });
    const { json, error } = await runCommand(Deposit, [
      "5 USDC",
      "--yes",
      "--json",
    ]);
    expect(error).toBeUndefined();
    expect(process.exitCode).toBeUndefined();
    expect(json).toMatchObject({ status: "pending", txHash: "0xfeed" });
  });

  it("does not wait for core with --wait mined", async () => {
    const { json } = await runCommand(Deposit, [
      "5",
      "-a",
      "USDC",
      "--gas",
      "self",
      "--wait",
      "mined",
      "--yes",
      "--json",
    ]);
    expect(client.deposit).toHaveBeenCalledWith(expect.anything(), {
      gas: "self",
      wait: "mined",
    });
    expect(mined.spendable).not.toHaveBeenCalled();
    expect(json).toMatchObject({ status: "mined" });
  });

  it("prints SDK failures as JSON with a code, and exits 1", async () => {
    class FourMicaError extends Error {}
    class InsufficientBalanceError extends FourMicaError {
      name = "InsufficientBalanceError";
    }
    client.deposit.mockRejectedValue(
      new InsufficientBalanceError("the wallet holds 0 USDC but this needs 5"),
    );
    const { json } = await runCommand(Deposit, [
      "5",
      "--asset",
      "USDC",
      "--yes",
      "--json",
    ]);
    expect(json).toEqual({
      error: {
        code: "INSUFFICIENT_BALANCE",
        message: "the wallet holds 0 USDC but this needs 5",
      },
    });
    expect(process.exitCode).toBe(EXIT.failure);
  });
});
