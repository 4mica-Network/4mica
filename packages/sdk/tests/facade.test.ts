import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@/client";
import type { Config } from "@/config";
import { ClientError, ConfigError, SpendLimitError } from "@/errors";
import { FourMica } from "@/facade";
import { NETWORKS } from "@/networks";
import { utf8ToBase64 } from "@/x402/base64";
import { fakeClient, SELLER, USDC } from "./helpers/facade";

const KEY = `0x${"11".repeat(32)}`;
const ADDRESS = privateKeyToAccount(KEY as `0x${string}`).address;

let configs: Config[];
let clients: ReturnType<typeof fakeClient>[];

beforeEach(() => {
  configs = [];
  clients = [];
  vi.spyOn(Client, "connect").mockImplementation(async (cfg: Config) => {
    configs.push(cfg);
    const hosted = Object.values(NETWORKS).find((n) => n.rpcUrl === cfg.rpcUrl);
    const fake = fakeClient({ chainId: hosted?.chainId ?? 84532 });
    fake.client.signerAddress = cfg.signer.address;
    clients.push(fake);
    return fake.asClient;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FourMica.connect", () => {
  it("connects the default network with its hosted facilitator", async () => {
    const client = await FourMica.connect({ privateKey: KEY });
    expect(client.address).toBe(ADDRESS);
    expect(client.network).toBe("base-sepolia");
    expect(configs[0]).toMatchObject({
      rpcUrl: NETWORKS["base-sepolia"].rpcUrl,
      facilitatorUrl: "https://testnet.payment.4mica.io/",
    });
  });

  it("takes network, rpcUrl and facilitatorUrl from the options", async () => {
    await FourMica.connect({ privateKey: KEY, network: "eip155:8453" });
    expect(configs[0].rpcUrl).toBe(NETWORKS.base.rpcUrl);

    const selfHosted = await FourMica.connect({
      privateKey: KEY,
      rpcUrl: "https://core.example/",
      facilitatorUrl: "https://facilitator.example/",
    });
    expect(configs[1]).toMatchObject({
      rpcUrl: "https://core.example/",
      facilitatorUrl: "https://facilitator.example/",
    });
    expect(selfHosted.network).toBe("eip155:84532");
  });

  it("reads the environment when no signer is passed", async () => {
    const client = await FourMica.connect({
      env: {
        FOURMICA_WALLET_PRIVATE_KEY: KEY,
        FOURMICA_NETWORK: "base",
      },
    });
    expect(client.address).toBe(ADDRESS);
    expect(client.network).toBe("base");

    await FourMica.connect({
      network: "base-sepolia",
      env: { FOURMICA_WALLET_PRIVATE_KEY: KEY, FOURMICA_NETWORK: "base" },
    });
    expect(configs[1].rpcUrl).toBe(NETWORKS["base-sepolia"].rpcUrl);
  });

  it("says how to supply a signer when there is none", async () => {
    await expect(FourMica.connect({ env: {} })).rejects.toThrow(
      /pass privateKey or signer.*FOURMICA_WALLET_PRIVATE_KEY/,
    );
    expect(Client.connect).not.toHaveBeenCalled();
  });

  it("refuses conflicting or unknown options before connecting", async () => {
    await expect(
      FourMica.connect({
        privateKey: KEY,
        signer: privateKeyToAccount(KEY as `0x${string}`),
      }),
    ).rejects.toThrow(ConfigError);
    await expect(
      FourMica.connect({ privateKey: KEY, protocols: ["mpp"] }),
    ).rejects.toThrow(/unknown payment protocol "mpp"/);
    await expect(
      FourMica.connect({ privateKey: KEY, spend: { perPayment: "1" } }),
    ).rejects.toThrow();
    expect(Client.connect).not.toHaveBeenCalled();
  });
});

describe("FourMica sessions", () => {
  it("connects another network once, on first use", async () => {
    const client = await FourMica.connect({ privateKey: KEY });
    const [a, b] = await Promise.all([
      client.lowLevel("base"),
      client.lowLevel("eip155:8453"),
    ]);
    expect(a).toBe(b);
    expect(configs.map((c) => c.rpcUrl)).toEqual([
      NETWORKS["base-sepolia"].rpcUrl,
      NETWORKS.base.rpcUrl,
    ]);
    expect(await client.lowLevel()).toBe(clients[0].asClient);
    expect(await client.lowLevel("base-sepolia")).toBe(clients[0].asClient);
    await expect(client.lowLevel("solana")).rejects.toThrow(ConfigError);
  });

  it("retries a network whose connect failed", async () => {
    const client = await FourMica.connect({ privateKey: KEY });
    vi.mocked(Client.connect).mockRejectedValueOnce(new Error("core down"));
    await expect(client.lowLevel("base")).rejects.toThrow("core down");
    await expect(client.lowLevel("base")).resolves.toBeDefined();
  });

  it("close() closes every network once, then refuses work", async () => {
    const client = await FourMica.connect({ privateKey: KEY });
    await client.lowLevel("base");
    await client.close();
    await client.close();
    for (const fake of clients) {
      expect(fake.client.aclose).toHaveBeenCalledOnce();
    }
    await expect(client.deposit("1 USDC")).rejects.toThrow(ClientError);
  });

  it("closes on scope exit with await using, even when the block throws", async () => {
    await expect(
      (async () => {
        await using client = await FourMica.connect({ privateKey: KEY });
        expect(client.address).toBe(ADDRESS);
        throw new Error("boom");
      })(),
    ).rejects.toThrow("boom");
    expect(clients[0].client.aclose).toHaveBeenCalledOnce();
  });

  it("deposits on another network through that network's client", async () => {
    const client = await FourMica.connect({ privateKey: KEY });
    const result = await client.deposit("1 USDC", {
      network: "base",
      wait: "mined",
    });
    expect(result.network).toBe("eip155:8453");
    expect(result.explorerUrl).toMatch(/^https:\/\/basescan\.org\/tx\//);
    expect(clients[1].client.deposit.of).toHaveBeenCalled();
    expect(clients[0].client.deposit.of).not.toHaveBeenCalled();
  });
});

describe("FourMica.balance", () => {
  it("reports held assets in their own units", async () => {
    const client = await FourMica.connect({ privateKey: KEY });
    vi.mocked(clients[0].client.rpc.getUserAssetBalance).mockImplementation(
      async (_user: string, asset: string) =>
        (asset === USDC
          ? { total: 5_000_000n, locked: 1_250_000n }
          : null) as never,
    );
    expect(await client.balance()).toEqual({
      USDC: {
        asset: { symbol: "USDC", address: USDC, decimals: 6 },
        total: "5",
        locked: "1.25",
        available: "3.75",
        raw: { total: 5_000_000n, locked: 1_250_000n, available: 3_750_000n },
      },
    });
    expect((await client.balance("ETH")).total).toBe("0");
  });
});

describe("FourMica.fetch", () => {
  const challenge = (amount: string) =>
    new Response("{}", {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": utf8ToBase64(
          JSON.stringify({
            x402Version: 2,
            resource: { url: "https://api.example.com/data" },
            accepts: [
              {
                scheme: "4mica-credit",
                network: "eip155:84532",
                asset: USDC,
                amount,
                payTo: SELLER,
              },
            ],
          }),
        ),
      },
    });

  it("pays a 402 on the session's network and reports it", async () => {
    const fetchFn = vi.fn(async (request: Request) =>
      request.headers.has("PAYMENT-SIGNATURE")
        ? new Response("data")
        : challenge("10000"),
    );
    const client = await FourMica.connect({
      privateKey: KEY,
      fetch: fetchFn as unknown as typeof fetch,
    });
    const res = await client.fetch("https://api.example.com/data");
    expect(await res.text()).toBe("data");
    expect(client.paymentFor(res)).toMatchObject({
      protocol: "x402",
      amount: "0.01",
      payTo: SELLER,
    });
    expect(client.paymentFor(new Response())).toBeUndefined();
  });

  it("refuses over the spend limit without signing", async () => {
    const fetchFn = vi.fn(async () => challenge("2000000"));
    const client = await FourMica.connect({
      privateKey: KEY,
      fetch: fetchFn as unknown as typeof fetch,
    });
    await expect(client.fetch("https://api.example.com/data")).rejects.toThrow(
      SpendLimitError,
    );
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(clients[0].client.signPayment).not.toHaveBeenCalled();
  });
});
