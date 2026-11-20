import type { ResolvedToken } from "@4mica/sdk/amounts";
import type { withSession } from "./session.js";
import type { Settings } from "./settings.js";

type Client = Parameters<Parameters<typeof withSession>[1]>[0];

/** Every asset the network takes: its native one, then core's token list. */
export async function listAssets(
  settings: Settings,
  client: Client,
): Promise<ResolvedToken[]> {
  const { resolveToken } = await import("@4mica/sdk/amounts");
  const nativeSymbol = settings.info?.nativeSymbol ?? "ETH";
  const { tokens } = await (await client.lowLevel()).tokens.supported();
  return [
    resolveToken(tokens, nativeSymbol, { nativeSymbol }),
    ...tokens.map((token) => ({ ...token, native: false })),
  ];
}

/** A symbol, the native symbol or an address, as core lists it. */
export async function resolveAsset(
  settings: Settings,
  client: Client,
  input: string,
): Promise<ResolvedToken> {
  const { resolveToken } = await import("@4mica/sdk/amounts");
  const nativeSymbol = settings.info?.nativeSymbol ?? "ETH";
  const { tokens } = await (await client.lowLevel()).tokens.supported();
  return resolveToken(tokens, input, { nativeSymbol });
}

/** `2.5 USDC`, or the bare number of base units for a token core dropped. */
export async function formatAmount(
  assets: readonly ResolvedToken[],
  address: string,
  raw: bigint,
): Promise<string> {
  const { formatUnits } = await import("@4mica/sdk/amounts");
  const token = assets.find(
    (a) => a.address.toLowerCase() === address.toLowerCase(),
  );
  return token
    ? `${formatUnits(raw, token.decimals)} ${token.symbol}`
    : `${raw} base units of ${address}`;
}

export const explorerTx = (settings: Settings, txHash: string) =>
  settings.info && `${settings.info.explorerUrl}/tx/${txHash}`;
