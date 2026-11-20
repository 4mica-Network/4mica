import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../../test/run.js";
import CyclesClaim from "./claim.js";
import CyclesPay from "./pay.js";

const USDC = { symbol: "USDC", address: "0xToken", decimals: 6 };
const terms = {
  cycleIdText: "0xtoken:100",
  assetAddress: "0xToken",
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
const settlement = { pay: vi.fn(() => builder), claim: vi.fn(() => builder) };
const client = {
  address: "0xWallet",
  lowLevel: async () => ({
    settlement,
    tokens: { supported: async () => ({ tokens: [USDC] }) },
  }),
};

vi.mock("../../core/session.js", () => ({
  withSession: (_settings: unknown, use: (c: typeof client) => unknown) =>
    use(client),
}));

beforeEach(() => {
  builder.action.mockResolvedValue(terms);
  builder.send.mockResolvedValue(receipt);
  builder.creditor.mockReturnValue(builder);
  own.send.mockResolvedValue({ ...receipt, route: "self-funded" });
});
afterEach(() => vi.clearAllMocks());

describe("cycles pay", () => {
  it("shows core's amount on a dry run and sends nothing", async () => {
    const { json } = await runCommand(CyclesPay, ["c1", "--dry-run", "--json"]);
    expect(settlement.pay).toHaveBeenCalledWith("c1");
    expect(json).toMatchObject({
      dryRun: true,
      amount: "2.5 USDC",
      amountRaw: "2500000",
    });
    expect(builder.send).not.toHaveBeenCalled();
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
