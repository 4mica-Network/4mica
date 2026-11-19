// Imports nothing at runtime: published as `@4mica/sdk/networks`. The data is
// `networks.json`, which the other SDKs and packages are drift-tested against.

import { InvalidParamsError } from "@/errors";
import type { NetworkInfo } from "@/networks/models";
import data from "../../networks.json";

export type { NetworkInfo } from "@/networks/models";

/**
 * Hosted 4Mica network deployments, keyed by human-readable shorthand.
 *
 * Pass the shorthand (or the CAIP-2 string) to {@link ConfigBuilder.network}
 * to select a network without writing a URL.
 *
 * @example
 * ```ts
 * import { Client, ConfigBuilder, NETWORKS } from "@4mica/sdk";
 *
 * // By shorthand
 * const cfg = new ConfigBuilder()
 *   .network("base")
 *   .walletPrivateKey("0x...")
 *   .build();
 *
 * // Inspect available networks
 * console.log(NETWORKS["base"].caip2); // "eip155:8453"
 * ```
 */
export const NETWORKS: Readonly<Record<string, NetworkInfo>> = Object.freeze(
  Object.fromEntries(
    Object.entries(data).map(([name, entry]) => [
      name,
      Object.freeze({
        ...entry,
        facilitatorUrl: entry.facilitatorUrl ?? undefined,
      }),
    ]),
  ),
);

/** `base` once the 2.0 mainnet upgrade lands. */
export const DEFAULT_NETWORK = "base-sepolia";

export function resolveNetwork(
  network: string,
): { name: string; info: NetworkInfo } | undefined {
  const key = network.trim().toLowerCase();
  // `in` would also match `constructor` and `__proto__`.
  const name = Object.hasOwn(NETWORKS, key)
    ? key
    : Object.keys(NETWORKS).find((n) => NETWORKS[n].caip2 === key);
  return name === undefined ? undefined : { name, info: NETWORKS[name] };
}

/** A CAIP-2 network identifier, the form x402 names networks by. */
export type Caip2 = `${string}:${string}`;

/**
 * Resolve any network name the SDK or the 4Mica API hands you to its CAIP-2 id.
 *
 * Accepts a shorthand (`"base-sepolia"`), the app API's enum (`"BASE_SEPOLIA"`,
 * as returned by `resource()`) or a CAIP-2 id. Throws
 * {@link InvalidParamsError} for anything that is not a hosted network.
 *
 * @example
 * ```ts
 * import { toCaip2 } from "@4mica/sdk";
 *
 * toCaip2("BASE_SEPOLIA"); // "eip155:84532"
 * ```
 */
export function toCaip2(network: string): Caip2 {
  const resolved = resolveNetwork(network.replace(/_/g, "-"));
  if (!resolved) {
    throw new InvalidParamsError(`unknown network: ${network}`);
  }
  return resolved.info.caip2 as Caip2;
}

/**
 * Resolve a network shorthand or CAIP-2 identifier to a core API URL.
 * Returns `undefined` if the identifier is not a known hosted network.
 */
export function resolveNetworkRpcUrl(network: string): string | undefined {
  return resolveNetwork(network)?.info.rpcUrl;
}
