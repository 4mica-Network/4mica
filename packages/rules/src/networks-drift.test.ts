import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PAYMENT_NETWORK_IDS, PAYMENT_NETWORKS } from "./networks";

// `rpcUrl` here is a chain RPC, not the 4Mica core URL, so it is not compared.
const SOURCE = "packages/sdk/networks.json";

type NetworkEntry = {
  caip2: string;
  chainId: number;
  label: string;
  explorerUrl: string;
  nativeSymbol: string;
  testnet: boolean;
};

const networks: Record<string, NetworkEntry> = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../sdk/networks.json", import.meta.url)),
    "utf8",
  ),
);

describe(`PAYMENT_NETWORKS agrees with ${SOURCE}`, () => {
  it("lists the same networks", () => {
    expect(
      PAYMENT_NETWORK_IDS.map((id) => PAYMENT_NETWORKS[id].sdkName).sort(),
      `PAYMENT_NETWORKS sdkNames drifted from the keys of ${SOURCE}`,
    ).toEqual(Object.keys(networks).sort());
  });

  it.each(PAYMENT_NETWORK_IDS)("%s matches its JSON entry", (id) => {
    const network = PAYMENT_NETWORKS[id];
    const entry = networks[network.sdkName];
    if (!entry) {
      throw new Error(
        `PAYMENT_NETWORKS.${id}.sdkName "${network.sdkName}" is not a key in ${SOURCE}`,
      );
    }
    const msg = (field: string) =>
      `PAYMENT_NETWORKS.${id}.${field} drifted from ${SOURCE}`;
    expect(network.caip2, msg("caip2")).toBe(entry.caip2);
    expect(network.chainId, msg("chainId")).toBe(entry.chainId);
    expect(network.explorer, msg("explorer")).toBe(entry.explorerUrl);
    expect(network.label, msg("label")).toBe(entry.label);
    expect(network.isTestnet, msg("isTestnet")).toBe(entry.testnet);
    expect(network.currency.symbol, msg("currency.symbol")).toBe(
      entry.nativeSymbol,
    );
  });
});
