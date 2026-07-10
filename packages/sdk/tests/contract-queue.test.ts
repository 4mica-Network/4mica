import { describe, expect, it, vi } from "vitest";
import { ContractGateway } from "@/contract";

const DUMMY_ADDRESS = "0x0000000000000000000000000000000000000001";
const CYCLE_ID = `0x${"aa".repeat(32)}` as const;
const PROOF = [`0x${"dd".repeat(32)}`] as const;

type ClearingHouseMock = {
  write: {
    claimNetCredit: ReturnType<typeof vi.fn>;
    payNetDebit: ReturnType<typeof vi.fn>;
    markDefaulted: ReturnType<typeof vi.fn>;
  };
};

type GatewayMocks = {
  gateway: ContractGateway;
  publicClient: { waitForTransactionReceipt: ReturnType<typeof vi.fn> };
  clearingHouse: ClearingHouseMock;
};

function createGateway(opts?: {
  writeImpl?: () => Promise<string>;
}): GatewayMocks {
  const publicClient = {
    waitForTransactionReceipt: vi.fn(async ({ hash }: { hash: string }) => ({
      hash,
      status: "success",
    })),
  };
  const walletClient = {
    sendTransaction: vi.fn(async () => "0xhash"),
    account: { address: DUMMY_ADDRESS },
  };
  const contract = { address: DUMMY_ADDRESS, write: {} };
  const clearingHouse: ClearingHouseMock = {
    write: {
      claimNetCredit: vi.fn(opts?.writeImpl ?? (async () => "0xhash")),
      payNetDebit: vi.fn(opts?.writeImpl ?? (async () => "0xhash")),
      markDefaulted: vi.fn(opts?.writeImpl ?? (async () => "0xhash")),
    },
  };

  const GatewayCtor = ContractGateway as unknown as new (
    publicClient: {
      waitForTransactionReceipt: (args: {
        hash: string;
      }) => Promise<{ hash: string }>;
    },
    walletClient: {
      sendTransaction: () => Promise<string>;
      account: { address: string };
    },
    contract: { address: string; write: Record<string, unknown> },
  ) => ContractGateway;
  const gateway = new GatewayCtor(publicClient, walletClient, contract);
  (
    gateway as unknown as {
      clearingHouseCache: Map<string, ClearingHouseMock>;
    }
  ).clearingHouseCache.set(DUMMY_ADDRESS, clearingHouse);
  return { gateway, publicClient, clearingHouse };
}

describe("ContractGateway transaction queue", () => {
  it("serializes ClearingHouse write calls to avoid nonce collisions", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const { gateway, clearingHouse } = createGateway({
      writeImpl: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inFlight -= 1;
        return "0xhash";
      },
    });

    const p1 = gateway.claimNetCredit(DUMMY_ADDRESS, CYCLE_ID, 1n, [...PROOF]);
    const p2 = gateway.claimNetCredit(DUMMY_ADDRESS, CYCLE_ID, 2n, [...PROOF]);
    await Promise.all([p1, p2]);

    expect(clearingHouse.write.claimNetCredit).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
  });

  it("continues processing after a failed submission", async () => {
    let call = 0;
    const { gateway, clearingHouse } = createGateway({
      writeImpl: async () => {
        call += 1;
        if (call === 1) throw new Error("boom");
        return "0xhash";
      },
    });

    const p1 = gateway.payNetDebit(DUMMY_ADDRESS, CYCLE_ID, 1n, [...PROOF], 0n);
    const p2 = gateway.payNetDebit(DUMMY_ADDRESS, CYCLE_ID, 2n, [...PROOF], 0n);
    const results = await Promise.allSettled([p1, p2]);

    expect(clearingHouse.write.payNetDebit).toHaveBeenCalledTimes(2);
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("fulfilled");
  });

  it("submits markDefaulted with an explicit gas limit", async () => {
    const { gateway, clearingHouse } = createGateway();

    await gateway.markDefaulted(DUMMY_ADDRESS, CYCLE_ID, DUMMY_ADDRESS, 5n, [
      ...PROOF,
    ]);

    expect(clearingHouse.write.markDefaulted).toHaveBeenCalledTimes(1);
    expect(clearingHouse.write.markDefaulted.mock.calls[0]?.[1]).toMatchObject({
      gas: 1_000_000n,
    });
  });

  it("attaches the native payable value on payNetDebit", async () => {
    const { gateway, clearingHouse } = createGateway();

    await gateway.payNetDebit(DUMMY_ADDRESS, CYCLE_ID, 7n, [...PROOF], 7n);

    expect(clearingHouse.write.payNetDebit.mock.calls[0]?.[1]).toMatchObject({
      value: 7n,
    });
  });
});
