import { describe, expect, it, vi } from "vitest";
import type { ClientCtx } from "@/client/ctx";
import { SettlementClient } from "@/client/settlement";
import type { ContractGateway } from "@/contract";
import { Erc20AllowanceRequiredError, InvalidParamsError } from "@/errors";
import type { RpcProxy } from "@/rpc";

const USER = "0x0000000000000000000000000000000000000011";
const RECIPIENT = "0x0000000000000000000000000000000000000022";
const ASSET = "0x0000000000000000000000000000000000000003";
const NATIVE = "0x0000000000000000000000000000000000000000";
const CLEARING_HOUSE = "0x0000000000000000000000000000000000000009";
const CYCLE_ID = `0x${"aa".repeat(32)}`;
const PROOF = [`0x${"dd".repeat(32)}`];
function fakeCtx(overrides: Partial<Record<string, unknown>> = {}): ClientCtx {
  return {
    signerAddress: RECIPIENT,
    rpc: {},
    facilitator: { isConfigured: () => false },
    gateway: async () => {
      throw new Error("no gateway in this test");
    },
    ...overrides,
  } as unknown as ClientCtx;
}

describe("SettlementClient", () => {
  const payAction = (overrides: Record<string, unknown> = {}) => ({
    contract_address: CLEARING_HOUSE,
    function_name: "payNetDebit",
    action: "pay_net_debit",
    cycle_id: CYCLE_ID,
    cycle_id_text: "c",
    asset_address: NATIVE,
    participant: RECIPIENT,
    amount: "0x64",
    payable_value: "0x64",
    proof: PROOF,
    ...overrides,
  });

  const claimAction = (overrides: Record<string, unknown> = {}) => ({
    contract_address: CLEARING_HOUSE,
    function_name: "claimNetCreditFor",
    action: "claim_net_credit",
    cycle_id: CYCLE_ID,
    cycle_id_text: "c",
    asset_address: NATIVE,
    participant: RECIPIENT,
    amount: "0x64",
    payable_value: "0",
    proof: PROOF,
    ...overrides,
  });

  const rpcWith = (raw: Record<string, unknown>) =>
    ({
      getClearingPayNetDebitAction: vi
        .fn()
        .mockImplementation(async (_cycle: string, _participant: string) => {
          const { ClearingSettlementActionResponse } = await import("@/models");
          return ClearingSettlementActionResponse.fromRpc(raw);
        }),
      getClearingClaimNetCreditAction: vi.fn().mockImplementation(async () => {
        const { ClearingSettlementActionResponse } = await import("@/models");
        return ClearingSettlementActionResponse.fromRpc(raw);
      }),
    }) as unknown as RpcProxy;

  it("pays a native net debit and forwards the payable value", async () => {
    const payNetDebit = vi
      .fn()
      .mockResolvedValue({ transactionHash: "0xtx", status: "success" });
    const settlement = new SettlementClient(
      fakeCtx({
        rpc: rpcWith(payAction()),
        gateway: async () => ({ payNetDebit }) as unknown as ContractGateway,
      }),
    );

    const receipt = await settlement.pay(CYCLE_ID).send();

    expect(payNetDebit).toHaveBeenCalledWith(
      CLEARING_HOUSE,
      CYCLE_ID,
      100n,
      PROOF,
      100n,
      undefined,
    );
    expect(receipt.txHash).toBe("0xtx");
    expect(receipt.account).toBe(RECIPIENT);
  });

  it("refuses a pay action prepared for someone else", async () => {
    const settlement = new SettlementClient(
      fakeCtx({ rpc: rpcWith(payAction({ participant: USER })) }),
    );
    await expect(settlement.pay(CYCLE_ID).send()).rejects.toThrow(
      InvalidParamsError,
    );
  });

  it("refuses a pay action naming the wrong function", async () => {
    const settlement = new SettlementClient(
      fakeCtx({
        rpc: rpcWith(payAction({ function_name: "claimNetCreditFor" })),
      }),
    );
    await expect(settlement.pay(CYCLE_ID).send()).rejects.toThrow(
      InvalidParamsError,
    );
  });

  it("requires an ERC-20 allowance before a token debit", async () => {
    const erc20Allowance = vi.fn().mockResolvedValue(1n);
    const settlement = new SettlementClient(
      fakeCtx({
        rpc: rpcWith(payAction({ asset_address: ASSET, payable_value: "0" })),
        gateway: async () => ({ erc20Allowance }) as unknown as ContractGateway,
      }),
    );
    await expect(settlement.pay(CYCLE_ID).send()).rejects.toThrow(
      Erc20AllowanceRequiredError,
    );
    expect(erc20Allowance).toHaveBeenCalledWith(ASSET, CLEARING_HOUSE);
  });

  it("claims a net credit for the committed creditor", async () => {
    const claimNetCreditFor = vi
      .fn()
      .mockResolvedValue({ transactionHash: "0xtx", status: "success" });
    const settlement = new SettlementClient(
      fakeCtx({
        rpc: rpcWith(claimAction()),
        gateway: async () =>
          ({ claimNetCreditFor }) as unknown as ContractGateway,
      }),
    );

    const receipt = await settlement.claim(CYCLE_ID).send();

    expect(claimNetCreditFor).toHaveBeenCalledWith(
      CLEARING_HOUSE,
      RECIPIENT,
      CYCLE_ID,
      100n,
      PROOF,
      undefined,
    );
    expect(receipt.account).toBe(RECIPIENT);
  });

  it("claims on behalf of another creditor", async () => {
    const claimNetCreditFor = vi
      .fn()
      .mockResolvedValue({ transactionHash: "0xtx", status: "success" });
    const rpc = rpcWith(claimAction({ participant: USER }));
    const settlement = new SettlementClient(
      fakeCtx({
        rpc,
        gateway: async () =>
          ({ claimNetCreditFor }) as unknown as ContractGateway,
      }),
    );

    const receipt = await settlement.claim(CYCLE_ID).creditor(USER).send();
    expect(claimNetCreditFor).toHaveBeenCalledWith(
      CLEARING_HOUSE,
      expect.stringMatching(/0x0*11$/i),
      CYCLE_ID,
      100n,
      PROOF,
      undefined,
    );
    expect(receipt.account.toLowerCase()).toBe(USER);
  });

  it("refuses a native-asset approve", async () => {
    const settlement = new SettlementClient(
      fakeCtx({ rpc: rpcWith(payAction()) }),
    );
    await expect(
      settlement.pay(CYCLE_ID).selfFunded().approve(),
    ).rejects.toThrow(InvalidParamsError);
  });
});
