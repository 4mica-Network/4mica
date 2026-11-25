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

const ready = {
  dryRun: true as const,
  action: "deposit 5 USDC",
  network: "base-sepolia",
  wallet: "0xWallet",
  details: {
    token: "USDC (0x036CbD53842c5426634e7929541eC2318f3dCF7e)",
    baseUnits: "5000000",
    gas: "sponsored, if the facilitator accepts the request",
    contract: "0xC0ffee0000000000000000000000000000000000",
  },
  problems: [] as string[],
  ready: true,
};
const previewDeposit = vi.fn();
vi.mock("../core/preview.js", async (original) => ({
  ...(await original<typeof import("../core/preview.js")>()),
  previewDeposit: (...args: unknown[]) => previewDeposit(...args),
}));

beforeEach(() => {
  previewDeposit.mockResolvedValue(ready);
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

  it("does not ask with --no-input, even where it could", async () => {
    const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: true,
    });
    const { error } = await runCommand(Deposit, [
      "5",
      "--asset",
      "USDC",
      "--no-input",
    ]);
    if (tty) Object.defineProperty(process.stdin, "isTTY", tty);
    else Reflect.deleteProperty(process.stdin, "isTTY");
    expect(error).toMatchObject({ code: "CONFIRMATION_REQUIRED" });
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
        suggestions: [
          expect.stringContaining("4mica balance"),
          expect.stringContaining("fund the wallet"),
        ],
      },
    });
    expect(process.exitCode).toBe(EXIT.failure);
  });

  it("shows the token, its address and the contract before sending", async () => {
    const { stderr } = await runCommand(Deposit, ["5", "-a", "USDC", "--yes"]);
    expect(stderr).toContain("Deposit 5 USDC");
    expect(stderr).toContain("network: base-sepolia (testnet)");
    expect(stderr).toContain(
      "token: USDC (0x036CbD53842c5426634e7929541eC2318f3dCF7e)",
    );
    expect(stderr).toContain("base units: 5000000");
    expect(stderr).toContain(
      "contract: 0xC0ffee0000000000000000000000000000000000",
    );
  });

  it("does not ask for, or send, a deposit that would fail", async () => {
    previewDeposit.mockResolvedValue({
      ...ready,
      problems: ["the wallet holds 1 USDC; this needs 5"],
      ready: false,
    });
    const { error } = await runCommand(Deposit, ["5", "-a", "USDC", "--yes"]);
    expect(error).toMatchObject({ code: "NOT_READY" });
    expect(error?.message).toContain("the wallet holds 1 USDC");
    expect(client.deposit).not.toHaveBeenCalled();
  });

  it("sends nothing on a dry run, even with --yes", async () => {
    const { json } = await runCommand(Deposit, [
      "5",
      "-a",
      "USDC",
      "--dry-run",
      "--yes",
      "--json",
    ]);
    expect(json).toMatchObject({ dryRun: true, ready: true });
    expect(client.deposit).not.toHaveBeenCalled();
  });

  it.each([
    [["0", "-a", "USDC"]],
    [["0.000", "-a", "USDC"]],
    [["0 USDC"]],
  ])("refuses a zero amount, %j, before connecting", async (argv) => {
    const { error } = await runCommand(Deposit, [...argv, "--yes"]);
    expect(error).toMatchObject({
      code: "AMOUNT_ZERO",
      oclif: { exit: EXIT.usage },
    });
    expect(previewDeposit).not.toHaveBeenCalled();
  });

  it("never says try again once the deposit may have been sent", async () => {
    // viem's receipt wait timing out: below the SDK, after the broadcast.
    client.deposit.mockRejectedValue(
      new Error(
        'Timed out while waiting for transaction with hash "0xfeed" to be confirmed.',
      ),
    );
    const { json } = await runCommand(Deposit, [
      "5",
      "-a",
      "USDC",
      "--yes",
      "--json",
    ]);
    const { error } = json as {
      error: {
        code: string;
        message: string;
        suggestions: string[];
        retryable: boolean;
      };
    };
    expect(error.code).toBe("OUTCOME_UNKNOWN");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("the deposit of 5 USDC");
    expect(error.suggestions.join(" ")).not.toMatch(/try again/);
    expect(error.suggestions.join(" ")).toContain("4mica balance");
  });

  it("keeps a revert definite: it says what happened", async () => {
    class FourMicaError extends Error {}
    class ContractError extends FourMicaError {
      name = "RevertedOnChainError";
    }
    client.deposit.mockRejectedValue(new ContractError("reverted on chain"));
    const { error } = await runCommand(Deposit, ["5", "-a", "USDC", "--yes"]);
    expect(error).toMatchObject({ code: "REVERTED_ON_CHAIN" });
  });
});
