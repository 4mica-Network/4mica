import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../../test/run.js";
import WithdrawalsCancel from "./cancel.js";
import WithdrawalsFinalize from "./finalize.js";
import Withdrawals from "./index.js";
import WithdrawalsRequest from "./request.js";

const USDC = { symbol: "USDC", address: "0xToken", decimals: 6 };
const sent = {
  txHash: "0xsent",
  route: "gasless",
  asset: USDC,
  network: "eip155:84532",
  explorerUrl: "https://sepolia.basescan.org/tx/0xsent",
};
const client = {
  address: "0xWallet",
  withdraw: vi.fn(),
  finalizeWithdrawal: vi.fn(),
  cancelWithdrawal: vi.fn(),
  withdrawals: vi.fn(),
  balance: vi.fn(),
  lowLevel: async () => ({ ctx: { contractAddress: "0xCore" } }),
};

vi.mock("../../core/session.js", () => ({
  withSession: (_settings: unknown, use: (c: typeof client) => unknown) =>
    use(client),
}));

beforeEach(() => {
  client.balance.mockResolvedValue({
    asset: USDC,
    total: "10",
    available: "10",
    locked: "0",
    raw: { available: 10_000_000n },
  });
  client.withdraw.mockResolvedValue(sent);
  client.finalizeWithdrawal.mockResolvedValue(sent);
  client.cancelWithdrawal.mockResolvedValue(sent);
  client.withdrawals.mockResolvedValue([
    {
      asset: USDC,
      amount: "2",
      amountRaw: 2_000_000n,
      requestedAt: new Date("2026-01-01T00:00:00Z"),
      readyAt: new Date("2026-01-23T00:00:00Z"),
      ready: true,
      network: "eip155:84532",
    },
  ]);
});
afterEach(() => vi.clearAllMocks());

describe("withdrawals", () => {
  it("lists what is pending and when it is ready", async () => {
    const { stdout } = await runCommand(Withdrawals, []);
    expect(stdout).toContain("USDC   2");
    expect(stdout).toContain("2026-01-23T00:00:00.000Z  ready");
  });

  it.each([
    [WithdrawalsRequest, ["5", "--asset", "USDC"]],
    [WithdrawalsFinalize, ["--asset", "USDC"]],
    [WithdrawalsCancel, ["--asset", "USDC"]],
  ])("sends nothing without --yes where it cannot ask", async (command, argv) => {
    const { error } = await runCommand(command, argv);
    expect(error).toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    expect(client.withdraw).not.toHaveBeenCalled();
    expect(client.finalizeWithdrawal).not.toHaveBeenCalled();
    expect(client.cancelWithdrawal).not.toHaveBeenCalled();
  });

  it("requests the amount it was given", async () => {
    const { json } = await runCommand(WithdrawalsRequest, [
      "5",
      "--asset",
      "USDC",
      "--yes",
      "--json",
    ]);
    expect(client.withdraw).toHaveBeenCalledWith({
      amount: "5",
      asset: "USDC",
    });
    expect(json).toMatchObject({ txHash: "0xsent" });
  });

  it("finalizes and cancels by asset", async () => {
    await runCommand(WithdrawalsFinalize, ["-a", "USDC", "--yes", "--json"]);
    expect(client.finalizeWithdrawal).toHaveBeenCalledWith("USDC");
    await runCommand(WithdrawalsCancel, ["-a", "USDC", "--yes", "--json"]);
    expect(client.cancelWithdrawal).toHaveBeenCalledWith("USDC");
  });

  it("does not finalize a withdrawal before its grace period ends", async () => {
    client.withdrawals.mockResolvedValue([
      {
        asset: USDC,
        amount: "2",
        requestedAt: new Date("2026-01-01T00:00:00Z"),
        readyAt: new Date("2026-01-23T00:00:00Z"),
        ready: false,
      },
    ]);
    const { error } = await runCommand(WithdrawalsFinalize, [
      "-a",
      "USDC",
      "--yes",
    ]);
    expect(error).toMatchObject({ code: "NOT_READY" });
    expect(client.finalizeWithdrawal).not.toHaveBeenCalled();
  });

  it.each([
    [WithdrawalsRequest, ["5", "--asset", "USDC"]],
    [WithdrawalsFinalize, ["--asset", "USDC"]],
    [WithdrawalsCancel, ["--asset", "USDC"]],
  ])("sends nothing on a dry run, even with --yes", async (command, argv) => {
    const { json } = await runCommand(command, [
      ...argv,
      "--dry-run",
      "--yes",
      "--json",
    ]);
    expect(json).toMatchObject({ dryRun: true });
    expect(client.withdraw).not.toHaveBeenCalled();
    expect(client.finalizeWithdrawal).not.toHaveBeenCalled();
    expect(client.cancelWithdrawal).not.toHaveBeenCalled();
  });

  it("needs an asset to finalize", async () => {
    const { error } = await runCommand(WithdrawalsFinalize, ["--yes"]);
    expect(error).toMatchObject({ code: "NO_ASSET" });
  });
});
