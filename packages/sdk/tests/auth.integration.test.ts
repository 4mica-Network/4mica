import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { AuthSession } from "@/auth";
import { Client } from "@/client";
import { ConfigBuilder } from "@/config";
import { RpcError } from "@/errors";

const DEFAULT_RPC_URL = "http://127.0.0.1:3000";
const DEFAULT_AUTH_URL = "http://127.0.0.1:3000";
const DEFAULT_PAYER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const integrationEnabled = process.env["4MICA_INTEGRATION"] === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;

const resolveRpcUrl = (): string =>
  process.env["4MICA_RPC_URL"] ?? DEFAULT_RPC_URL;
const resolveAuthUrl = (rpcUrl: string): string =>
  process.env["4MICA_AUTH_URL"] ?? rpcUrl ?? DEFAULT_AUTH_URL;
const resolvePrivateKey = (): string =>
  process.env["PAYER_KEY"] ??
  process.env["4MICA_WALLET_PRIVATE_KEY"] ??
  DEFAULT_PAYER_KEY;

const isUnauthorized = (err: unknown): boolean =>
  err instanceof RpcError && err.status === 401;

const resolveBearerToken = async (
  authUrl: string,
  privateKey: string,
): Promise<string> => {
  const token = process.env["4MICA_BEARER_TOKEN"];
  if (token) {
    return token;
  }
  const session = new AuthSession({
    authUrl,
    signer: privateKeyToAccount(privateKey as Hex),
  });
  try {
    const tokens = await session.login();
    return tokens.accessToken;
  } finally {
    await session.logout();
  }
};

describeIntegration("Auth integration", () => {
  it("auth login allows core request", async () => {
    const rpcUrl = resolveRpcUrl();
    const authUrl = resolveAuthUrl(rpcUrl);
    const privateKey = resolvePrivateKey();

    const cfg = new ConfigBuilder()
      .rpcUrl(rpcUrl)
      .walletPrivateKey(privateKey)
      .authUrl(authUrl)
      .enableAuth()
      .build();

    const client = await Client.new(cfg);
    try {
      const tokens = await client.login();
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();

      const userAddress = privateKeyToAccount(privateKey as Hex).address;
      const asset =
        process.env["ASSET_ADDRESS"] ??
        "0x0000000000000000000000000000000000000000";
      try {
        await client.rpc.getUserAssetBalance(userAddress, asset);
      } catch (err) {
        if (isUnauthorized(err)) {
          throw err;
        }
      }
    } finally {
      await client.aclose();
    }
  });

  it("bearer token allows core request", async () => {
    const rpcUrl = resolveRpcUrl();
    const authUrl = resolveAuthUrl(rpcUrl);
    const privateKey = resolvePrivateKey();
    const bearerToken = await resolveBearerToken(authUrl, privateKey);

    const cfg = new ConfigBuilder()
      .rpcUrl(rpcUrl)
      .walletPrivateKey(privateKey)
      .bearerToken(bearerToken)
      .build();

    const client = await Client.new(cfg);
    try {
      const userAddress = privateKeyToAccount(privateKey as Hex).address;
      const asset =
        process.env["ASSET_ADDRESS"] ??
        "0x0000000000000000000000000000000000000000";
      try {
        await client.rpc.getUserAssetBalance(userAddress, asset);
      } catch (err) {
        if (isUnauthorized(err)) {
          throw err;
        }
      }
    } finally {
      await client.aclose();
    }
  });
});
