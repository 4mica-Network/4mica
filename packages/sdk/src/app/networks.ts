import type { AppNetwork } from "@/app/models";
import { InvalidParamsError } from "@/errors";
import { NETWORKS } from "@/networks";

const APP_NETWORKS: ReadonlySet<string> = new Set([
  "BASE",
  "BASE_SEPOLIA",
  "ETHEREUM_SEPOLIA",
]);

const fromShorthand = (shorthand: string): string =>
  shorthand.toUpperCase().replace(/-/g, "_");

export function toAppNetwork(network: string): AppNetwork {
  const value = network.trim();

  if (APP_NETWORKS.has(value.toUpperCase())) {
    return value.toUpperCase() as AppNetwork;
  }

  const lower = value.toLowerCase();
  if (lower in NETWORKS) {
    return fromShorthand(lower) as AppNetwork;
  }

  const shorthand = Object.keys(NETWORKS).find(
    (key) => NETWORKS[key].caip2 === lower,
  );
  if (shorthand) {
    return fromShorthand(shorthand) as AppNetwork;
  }

  throw new InvalidParamsError(`unknown network: ${network}`);
}

export function fromAppNetwork(network: string): string {
  return toAppNetwork(network).toLowerCase().replace(/_/g, "-");
}
