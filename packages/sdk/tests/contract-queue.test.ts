import { describe, expect, it, vi } from "vitest";
import { ContractGateway } from "../src/contract";

const DUMMY_ADDRESS = "0x0000000000000000000000000000000000000001";

type GatewayMocks = {
  gateway: ContractGateway;
  publicClient: { waitForTransactionReceipt: ReturnType<typeof vi.fn> };
  walletClient: {
    sendTransaction: ReturnType<typeof vi.fn>;
    account: { address: string };
  };
  contract: {
    address: string;
    write: {
      payTabInERC20Token: ReturnType<typeof vi.fn>;
      remunerate: ReturnType<typeof vi.fn>;
    };
  };
  erc20: {
    read: { allowance: ReturnType<typeof vi.fn> };
    write: { approve: ReturnType<typeof vi.fn> };
  };
};

function createGateway(opts?: {
  writeImpl?: () => Promise<string>;
  sendImpl?: () => Promise<string>;
}): GatewayMocks {
  const publicClient = {
    waitForTransactionReceipt: vi.fn(async ({ hash }: { hash: string }) => ({
      hash,
      status: "success",
    })),
  };
  const walletClient = {
    sendTransaction: vi.fn(opts?.sendImpl ?? (async () => "0xhash")),
    account: { address: DUMMY_ADDRESS },
  };
  const contract = {
    address: DUMMY_ADDRESS,
    write: {
      payTabInERC20Token: vi.fn(opts?.writeImpl ?? (async () => "0xhash")),
      remunerate: vi.fn(opts?.writeImpl ?? (async () => "0xhash")),
    },
  };
  const erc20 = {
    read: { allowance: vi.fn(async () => 2n ** 256n - 1n) },
    write: { approve: vi.fn(async () => "0xhash") },
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
    contract: {
      address: string;
      write: {
        payTabInERC20Token: () => Promise<string>;
        remunerate: () => Promise<string>;
      };
    },
  ) => ContractGateway;
  const gateway = new GatewayCtor(publicClient, walletClient, contract);
  (
    gateway as unknown as {
      erc20Cache: Map<string, typeof erc20>;
    }
  ).erc20Cache.set(DUMMY_ADDRESS, erc20);
  return { gateway, publicClient, walletClient, contract, erc20 };
}

describe("ContractGateway transaction queue", () => {
  it("serializes contract.write calls to avoid nonce collisions", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const { gateway, contract } = createGateway({
      writeImpl: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inFlight -= 1;
        return "0xhash";
      },
    });

    const p1 = gateway.payTabErc20(1n, 2n, DUMMY_ADDRESS, DUMMY_ADDRESS);
    const p2 = gateway.payTabErc20(2n, 3n, DUMMY_ADDRESS, DUMMY_ADDRESS);
    await Promise.all([p1, p2]);

    expect(contract.write.payTabInERC20Token).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
  });

  it("serializes wallet sendTransaction calls", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const { gateway, walletClient } = createGateway({
      sendImpl: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inFlight -= 1;
        return "0xhash";
      },
    });

    const p1 = gateway.payTabEth(1n, 1n, 10n, DUMMY_ADDRESS);
    const p2 = gateway.payTabEth(2n, 2n, 10n, DUMMY_ADDRESS);
    await Promise.all([p1, p2]);

    expect(walletClient.sendTransaction).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
  });

  it("continues processing after a failed submission", async () => {
    let call = 0;
    const { gateway, contract } = createGateway({
      writeImpl: async () => {
        call += 1;
        if (call === 1) throw new Error("boom");
        return "0xhash";
      },
    });

    const p1 = gateway.payTabErc20(1n, 2n, DUMMY_ADDRESS, DUMMY_ADDRESS);
    const p2 = gateway.payTabErc20(2n, 3n, DUMMY_ADDRESS, DUMMY_ADDRESS);
    const results = await Promise.allSettled([p1, p2]);

    expect(contract.write.payTabInERC20Token).toHaveBeenCalledTimes(2);
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("fulfilled");
  });

  it("submits remunerate with an explicit gas limit", async () => {
    const { gateway, contract } = createGateway();

    await gateway.remunerate(
      new Uint8Array([1, 2, 3]),
      Array.from({ length: 8 }, () => new Uint8Array(32)),
    );

    expect(contract.write.remunerate).toHaveBeenCalledTimes(1);
    expect(contract.write.remunerate.mock.calls[0]?.[1]).toMatchObject({
      gas: 8_000_000n,
    });
  });

  it("polls allowance verification after approve until RPC reads catch up", async () => {
    const { gateway } = createGateway();
    const token = "0x0000000000000000000000000000000000000002";
    const approve = vi.fn(async () => "0xhash");
    const allowance = vi
      .fn()
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(10_000n);

    (
      gateway as unknown as {
        erc20Cache: Map<
          string,
          {
            read: { allowance: ReturnType<typeof vi.fn> };
            write: { approve: ReturnType<typeof vi.fn> };
          }
        >;
      }
    ).erc20Cache.set(token, {
      read: { allowance },
      write: { approve },
    });

    await expect(
      gateway.approveErc20(token, 10_000n, {
        timeout: 100,
        pollingInterval: 1,
      }),
    ).resolves.toMatchObject({ hash: "0xhash", status: "success" });

    expect(approve).toHaveBeenCalledTimes(1);
    expect(allowance).toHaveBeenCalledTimes(3);
  });
});
