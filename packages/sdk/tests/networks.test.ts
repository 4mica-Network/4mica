import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_NETWORK,
  NETWORKS,
  resolveNetwork,
  resolveNetworkRpcUrl,
} from "@/networks";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("networks", () => {
  it("is networks.json, with null facilitators as undefined", () => {
    const json = JSON.parse(read("../networks.json")) as Record<
      string,
      Record<string, unknown>
    >;
    expect(Object.keys(NETWORKS)).toEqual(Object.keys(json));
    for (const [name, entry] of Object.entries(json)) {
      expect(NETWORKS[name]).toEqual({
        ...entry,
        facilitatorUrl: entry.facilitatorUrl ?? undefined,
      });
    }
  });

  it("keeps each entry consistent", () => {
    for (const info of Object.values(NETWORKS)) {
      expect(info.caip2).toBe(`eip155:${info.chainId}`);
      expect(info.rpcUrl).toMatch(/^https:\/\/.+\/$/);
      expect(info.explorerUrl).toMatch(/^https:\/\/[^/]+$/);
    }
    expect(NETWORKS[DEFAULT_NETWORK]).toBeDefined();
  });

  it("resolves a shorthand or a CAIP-2 id", () => {
    expect(resolveNetwork("base-sepolia")?.info.chainId).toBe(84532);
    expect(resolveNetwork(" EIP155:8453 ")?.name).toBe("base");
    expect(resolveNetwork("solana")).toBeUndefined();
    expect(resolveNetworkRpcUrl("eip155:84532")).toBe(
      "https://base.sepolia.api.4mica.io/",
    );
    expect(resolveNetwork("base-sepolia")?.info.facilitatorUrl).toBe(
      "https://testnet.payment.4mica.io/",
    );
  });

  it("cannot be mutated by a consumer", () => {
    expect(() => {
      (NETWORKS.base as { rpcUrl: string }).rpcUrl = "https://evil.example/";
    }).toThrow(TypeError);
  });
});

// The import-free entry points must stay import-free.
describe("import-free entry points", () => {
  const SRC = "../src/";
  const allowed = new Set([
    "networks/index.ts",
    "networks/models.ts",
    "amounts/index.ts",
    "errors/index.ts",
  ]);

  for (const file of allowed) {
    it(`${file} imports nothing outside the entry points`, () => {
      const source = read(SRC + file);
      const specifiers = [
        ...source.matchAll(
          /^\s*(?:import|export)\b[^"']*?from\s+["']([^"']+)["']/gm,
        ),
        ...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
      ].map((m) => m[1]);
      for (const specifier of specifiers) {
        if (specifier === "../../networks.json") continue;
        expect(specifier, `${file} imports ${specifier}`).toMatch(/^@\//);
        const target = specifier.slice(2);
        expect(
          allowed.has(`${target}.ts`) || allowed.has(`${target}/index.ts`),
          `${file} imports ${specifier}`,
        ).toBe(true);
      }
    });
  }
});
