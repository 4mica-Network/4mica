import { FourMicaFacilitatorClient } from "@4mica/x402/server";
import { parseUnits, zeroAddress } from "viem";
import { describe } from "vitest";
import {
  Client,
  ConfigBuilder,
  type FlowSigner,
  type SupportedTokenInfo,
  type TabResponse,
  X402Flow,
} from "@/index";
import type { PaymentRequirementsV1, PaymentRequirementsV2 } from "@/x402";

export const DEFAULT_RPC_URL = "http://127.0.0.1:3000/";
export const DEFAULT_PAYER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const DEFAULT_RECIPIENT_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
export const DEFAULT_FACILITATOR_URL = "http://127.0.0.1:8080";

export const resolveRpcUrl = (): string =>
  process.env["4MICA_RPC_URL"] ?? DEFAULT_RPC_URL;
export const resolvePayerKey = (): string =>
  process.env["PAYER_PRIVATE_KEY"] ??
  process.env["4MICA_WALLET_PRIVATE_KEY"] ??
  DEFAULT_PAYER_KEY;
export const resolveRecipientKey = (): string =>
  process.env["RECIPIENT_PRIVATE_KEY"] ?? DEFAULT_RECIPIENT_KEY;
export const resolveFacilitatorUrl = (): string =>
  (process.env["FACILITATOR_URL"] ?? DEFAULT_FACILITATOR_URL).replace(
    /\/$/,
    "",
  );

export const ETH_ASSET = zeroAddress;
export const ETH_DECIMALS = 18;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const toHex = (value: bigint): string => `0x${value.toString(16)}`;

export const envNumber = (name: string, defaultValue: number): number => {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return defaultValue;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
};

export const clientAddress = (client: Client): `0x${string}` =>
  client.signer.signer.address as `0x${string}`;

export const makePayerClient = async (): Promise<Client> => {
  const cfg = new ConfigBuilder()
    .rpcUrl(resolveRpcUrl())
    .walletPrivateKey(resolvePayerKey())
    .enableAuth()
    .build();
  const client = await Client.new(cfg);
  await client.login();
  return client;
};

export const makeRecipientClient = async (): Promise<Client> => {
  const cfg = new ConfigBuilder()
    .rpcUrl(resolveRpcUrl())
    .walletPrivateKey(resolveRecipientKey())
    .enableAuth()
    .build();
  const client = await Client.new(cfg);
  await client.login();
  return client;
};

export const makeFacilitatorClient = (): FourMicaFacilitatorClient =>
  new FourMicaFacilitatorClient({ url: resolveFacilitatorUrl() });

export const getSupportedStablecoins = async (
  client: Client,
): Promise<{ address: `0x${string}`; decimals: number; symbol: string }[]> => {
  const { tokens } = await client.rpc.getSupportedTokens();
  return tokens
    .filter((t): t is SupportedTokenInfo & { decimals: number } =>
      Boolean(t.address && t.decimals !== undefined),
    )
    .map((t) => ({
      address: t.address as `0x${string}`,
      decimals: t.decimals as number,
      symbol: t.symbol,
    }));
};

export class FacilitatorX402Flow extends X402Flow {
  lastTab?: TabResponse & { assetAddress: string; ttlSeconds?: number };

  constructor(
    signer: FlowSigner,
    private facilitatorClient: FourMicaFacilitatorClient,
  ) {
    super(signer);
  }

  protected override async requestTab(
    _x402Version: number,
    paymentRequirements: PaymentRequirementsV1 | PaymentRequirementsV2,
    userAddress: string,
  ): Promise<TabResponse> {
    const tab = await this.facilitatorClient.openTab(
      userAddress,
      {
        payTo: paymentRequirements.payTo,
        network: paymentRequirements.network,
        asset: paymentRequirements.asset,
      } as Parameters<FourMicaFacilitatorClient["openTab"]>[1],
      paymentRequirements.maxTimeoutSeconds,
    );

    this.lastTab = {
      tabId: tab.tabId,
      userAddress: tab.userAddress ?? userAddress,
      nextReqId: tab.nextReqId ?? "0x0",
      assetAddress: tab.assetAddress ?? paymentRequirements.asset,
      ttlSeconds: tab.ttlSeconds,
    };
    return this.lastTab;
  }
}

export const issueGuaranteeViaFacilitator = async (
  facilitatorClient: FourMicaFacilitatorClient,
  envelope: Parameters<FourMicaFacilitatorClient["settle"]>[0],
  requirements: Parameters<FourMicaFacilitatorClient["settle"]>[1],
) => {
  const settled = await facilitatorClient.settle(envelope, requirements);
  if (!settled.certificate?.claims || !settled.certificate.signature) {
    throw new Error(
      `facilitator certificate malformed: ${JSON.stringify(settled)}`,
    );
  }
  return {
    claims: settled.certificate.claims,
    signature: settled.certificate.signature,
  };
};

export const e2eEnabled = process.env["4MICA_E2E"] === "1";
export const describeE2E = e2eEnabled ? describe : describe.skip;

export const resolveDepositAmount = (decimals: number): bigint =>
  parseUnits(process.env["DEPOSIT_AMOUNT"] ?? "0.001", decimals);

export const resolveGuaranteeAmount = (decimals: number): bigint =>
  parseUnits(process.env["GUARANTEE_AMOUNT"] ?? "0.0001", decimals);

export const resolveV2GuaranteeAmount = (decimals: number): bigint =>
  parseUnits(process.env["V2_GUARANTEE_AMOUNT"] ?? "0.0001", decimals);

export const resolveTabTtl = (): number => envNumber("TAB_TTL_SECONDS", 300);
