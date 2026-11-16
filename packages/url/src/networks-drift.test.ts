import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { links } from "./index";

const SOURCE = "packages/sdk/networks.json";

type NetworkEntry = { rpcUrl: string; explorerUrl: string };

const networks: Record<string, NetworkEntry> = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../sdk/networks.json", import.meta.url)),
    "utf8",
  ),
);

const shorthandFor = {
  base: "base",
  baseSepolia: "base-sepolia",
  ethereumSepolia: "ethereum-sepolia",
} as const;

const entry = (key: keyof typeof shorthandFor): NetworkEntry => {
  const shorthand = shorthandFor[key];
  const found = networks[shorthand];
  if (!found) {
    throw new Error(
      `${shorthand} (links key ${key}) is missing from ${SOURCE}`,
    );
  }
  return found;
};

describe(`links agree with ${SOURCE}`, () => {
  it.each(
    Object.entries(links.api) as [keyof typeof links.api, string][],
  )("links.api.%s equals rpcUrl", (key, url) => {
    expect(url, `links.api.${key} drifted from ${SOURCE}`).toBe(
      entry(key).rpcUrl,
    );
  });

  it(`links.api covers every network in ${SOURCE}`, () => {
    const covered = Object.keys(links.api).map(
      (key) => shorthandFor[key as keyof typeof shorthandFor],
    );
    expect(covered.sort(), `links.api networks drifted from ${SOURCE}`).toEqual(
      Object.keys(networks).sort(),
    );
  });

  it.each(
    Object.entries(links.explorer) as [keyof typeof links.explorer, string][],
  )("links.explorer.%s equals explorerUrl", (key, url) => {
    expect(url, `links.explorer.${key} drifted from ${SOURCE}`).toBe(
      entry(key).explorerUrl,
    );
  });
});
