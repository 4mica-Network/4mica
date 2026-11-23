import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runtime } from "../../core/runtime.js";
import { runCommand } from "../../test/run.js";
import CyclesClaim from "./claim.js";
import CyclesPay from "./pay.js";

const USDC = { symbol: "USDC", address: "0xToken", decimals: 6 };
const terms = {
  cycleIdText: "0xtoken:100",
  assetAddress: "0xToken",
  contractAddress: "0xClearingHouse",
  participant: "0xWallet",
  amount: 2_500_000n,
};
const receipt = { txHash: "0xpaid", route: "gasless", account: "0xWallet" };

const own = { approve: vi.fn(), send: vi.fn() };
const builder = {
  action: vi.fn(),
  send: vi.fn(),
  selfFunded: vi.fn(() => own),
  creditor: vi.fn(),
};
const settlement = {
  pay: vi.fn(() => builder),
  claim: vi.fn(() => builder),
  isGaslessAvailable: vi.fn(),
};
/** What the wallet holds; each test starts from one that can do anything. */
const wallet = { usdc: 0n, eth: 0n, allowance: 0n };
const allowance = vi.fn(async (_token: string, _spender: string) => {
  return wallet.allowance;
});
const client = {
  address: "0xWallet",
  lowLevel: async () => ({
    settlement,
    tokens: { supported: async () => ({ tokens: [USDC] }) },
    ctx: {
      gateway: async () => ({
        nativeBalance: async () => wallet.eth,
        erc20Balance: async () => wallet.usdc,
        erc20Allowance: allowance,
      }),
    },
  }),
};

vi.mock("../../core/session.js", () => ({
  withSession: (_settings: unknown, use: (c: typeof client) => unknown) =>
    use(client),
}));

beforeEach(() => {
  process.exitCode = undefined;
  Object.assign(wallet, { usdc: 10_000_000n, eth: 10n ** 18n, allowance: 0n });
  settlement.isGaslessAvailable.mockReturnValue(true);
  builder.action.mockResolvedValue(terms);
  builder.send.mockResolvedValue(receipt);
  builder.creditor.mockReturnValue(builder);
  own.send.mockResolvedValue({ ...receipt, route: "self-funded" });
});
afterEach(() => {
  process.exitCode = undefined;
  vi.clearAllMocks();
});

const dryRun = async (
  command: Parameters<typeof runCommand>[0],
  argv: string[] = [],
) =>
  (await runCommand(command, ["c1", "--dry-run", "--json", ...argv])).json as {
    ready: boolean;
    problems: string[];
    details: Record<string, string>;
  };

describe("cycles pay", () => {
  it("shows core's amount on a dry run and sends nothing", async () => {
    const { json } = await runCommand(CyclesPay, ["c1", "--dry-run", "--json"]);
    expect(settlement.pay).toHaveBeenCalledWith("c1");
    expect(json).toMatchObject({
      dryRun: true,
      action: "pay 2.5 USDC for cycle 0xtoken:100",
      amount: "2.5 USDC",
      amountRaw: "2500000",
      participant: "0xWallet",
      ready: true,
      problems: [],
      details: { "wallet holds": "10 USDC" },
    });
    expect(builder.send).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  describe("--dry-run says no, and exits 1, when", () => {
    it("the wallet does not hold what it owes", async () => {
      wallet.usdc = 0n;
      const preview = await dryRun(CyclesPay);
      expect(preview.ready).toBe(false);
      expect(preview.problems).toEqual([
        "the wallet holds 0 USDC; this needs 2.5 USDC",
      ]);
      expect(process.exitCode).toBe(1);
      const { stdout } = await runCommand(CyclesPay, ["c1", "--dry-run"]);
      expect(stdout).toContain("ready: no");
      expect(stdout).not.toContain("ready: yes");
    });

    it("the wallet pays for the transaction and has no gas", async () => {
      wallet.eth = 0n;
      // Sponsored: gas is not this wallet's to find.
      expect((await dryRun(CyclesPay)).ready).toBe(true);
      wallet.allowance = terms.amount;
      for (const argv of [["--gas", "self"], []]) {
        settlement.isGaslessAvailable.mockReturnValue(argv.length > 0);
        expect((await dryRun(CyclesPay, argv)).problems).toEqual([
          "the wallet pays for this transaction and holds no ETH",
        ]);
        expect(process.exitCode).toBe(1);
      }
    });

    it("nothing sponsors it and the token is not approved", async () => {
      settlement.isGaslessAvailable.mockReturnValue(false);
      expect((await dryRun(CyclesPay)).problems).toEqual([
        "the wallet has not approved the token for this payment; --gas self approves it first",
      ]);
      expect(allowance).toHaveBeenCalledWith("0xToken", "0xClearingHouse");
      // `--gas self` approves before it pays, so that is not in its way.
      process.exitCode = undefined;
      expect((await dryRun(CyclesPay, ["--gas", "self"])).ready).toBe(true);
      expect(process.exitCode).toBeUndefined();
    });

    it("a native debit would take the wallet's last wei", async () => {
      builder.action.mockResolvedValue({
        ...terms,
        assetAddress: "0x0000000000000000000000000000000000000000",
        amount: wallet.eth,
      });
      expect((await dryRun(CyclesPay)).problems).toEqual([
        "paying all of it leaves no ETH for gas",
      ]);
    });
  });

  it("will not pay without --yes where it cannot ask", async () => {
    const { error } = await runCommand(CyclesPay, ["c1"]);
    expect(error).toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    expect(builder.send).not.toHaveBeenCalled();
  });

  it("pays, and reports the transaction", async () => {
    const { json } = await runCommand(CyclesPay, ["c1", "--yes", "--json"]);
    expect(builder.send).toHaveBeenCalledOnce();
    expect(json).toMatchObject({
      txHash: "0xpaid",
      cycle: "0xtoken:100",
      amount: "2.5 USDC",
    });
  });

  it("is quiet when -q is grouped with another short flag", async () => {
    await runCommand(CyclesPay, ["c1", "-qy", "--json"]);
    expect(builder.send).toHaveBeenCalledOnce();
    expect(runtime.quiet).toBe(true);
    // And not left quiet for the next command in the same process.
    await runCommand(CyclesPay, ["c1", "-y", "--json"]);
    expect(runtime.quiet).toBe(false);
    for (const argv of [["-q"], ["--quiet"], ["-yq"]]) {
      await runCommand(CyclesPay, ["c1", "--yes", "--json", ...argv]);
      expect(runtime.quiet).toBe(true);
    }
  });

  it("approves a token before paying from the wallet itself", async () => {
    await runCommand(CyclesPay, ["c1", "--gas", "self", "--yes", "--json"]);
    expect(own.approve).toHaveBeenCalledOnce();
    expect(own.send).toHaveBeenCalledOnce();
    expect(own.approve.mock.invocationCallOrder[0]).toBeLessThan(
      own.send.mock.invocationCallOrder[0],
    );
    expect(builder.send).not.toHaveBeenCalled();
  });

  it("skips the approval for a native debit, which rides with the transaction", async () => {
    builder.action.mockResolvedValue({
      ...terms,
      assetAddress: "0x0000000000000000000000000000000000000000",
    });
    await runCommand(CyclesPay, ["c1", "--gas", "self", "--yes", "--json"]);
    expect(own.approve).not.toHaveBeenCalled();
    expect(own.send).toHaveBeenCalledOnce();
  });
});

describe("cycles claim", () => {
  it("is ready on a dry run when the claim is sponsored", async () => {
    wallet.eth = 0n;
    const preview = await dryRun(CyclesClaim);
    expect(preview).toMatchObject({
      dryRun: true,
      action: "claim 2.5 USDC for cycle 0xtoken:100",
      amount: "2.5 USDC",
      ready: true,
    });
    expect(builder.send).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("is not ready when the wallet has to send it and has no gas", async () => {
    wallet.eth = 0n;
    for (const argv of [["--gas", "self"], []]) {
      settlement.isGaslessAvailable.mockReturnValue(argv.length > 0);
      const preview = await dryRun(CyclesClaim, argv);
      expect(preview.ready).toBe(false);
      expect(preview.problems).toEqual([
        "the wallet pays for this transaction and holds no ETH",
      ]);
      expect(process.exitCode).toBe(1);
    }
    expect(builder.send).not.toHaveBeenCalled();
  });

  it("claims for another address when asked", async () => {
    await runCommand(CyclesClaim, [
      "c1",
      "--creditor",
      "0xOther",
      "--yes",
      "--json",
    ]);
    expect(settlement.claim).toHaveBeenCalledWith("c1");
    expect(builder.creditor).toHaveBeenCalledWith("0xOther");
    expect(builder.send).toHaveBeenCalledOnce();
  });
});
