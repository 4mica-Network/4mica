import { readFileSync } from "node:fs";
import type { Abi, AbiFunction } from "viem";
import { describe, expect, it } from "vitest";
import { clearingHouseAbi } from "@/abi/clearinghouse";
import { core4micaAbi } from "@/abi/core4mica";

/** The generated ABIs must match `contracts/abi/*.json` exactly. */
function loadSource(name: string): Abi {
  const url = new URL(`../../../contracts/abi/${name}.json`, import.meta.url);
  return (JSON.parse(readFileSync(url, "utf8")) as { abi: Abi }).abi;
}

function functionNames(abi: Abi): Set<string> {
  return new Set(
    abi
      .filter((entry): entry is AbiFunction => entry.type === "function")
      .map((entry) => entry.name),
  );
}

/** Functions the SDK calls by name. */
const CORE_FUNCTIONS = [
  "deposit",
  "depositStablecoin",
  "requestWithdrawal",
  "cancelWithdrawal",
  "finalizeWithdrawal",
  "getUserAllAssets",
  "getGuaranteeVersionConfig",
  "guaranteeDomainSeparator",
  "principalBalance",
  "withdrawableBalance",
  "guaranteeCapacity",
  "grossYield",
  "protocolYieldShare",
  "userNetYield",
  "totalUserScaledBalance",
  "protocolScaledBalance",
  "surplusScaledBalance",
  "contractScaledATokenBalance",
  "stablecoinAToken",
];

const CLEARING_FUNCTIONS = ["payNetDebit", "claimNetCreditFor"];

describe("vendored contract ABIs", () => {
  it("core4micaAbi matches contracts/abi/Core4Mica.json", () => {
    expect(core4micaAbi).toEqual(loadSource("Core4Mica"));
  });

  it("clearingHouseAbi matches contracts/abi/ClearingHouse.json", () => {
    expect(clearingHouseAbi).toEqual(loadSource("ClearingHouse"));
  });

  it("declares every function the SDK calls", () => {
    const core = functionNames(core4micaAbi);
    for (const name of CORE_FUNCTIONS) {
      expect(core.has(name), `Core4Mica.${name}`).toBe(true);
    }
    const clearing = functionNames(clearingHouseAbi);
    for (const name of CLEARING_FUNCTIONS) {
      expect(clearing.has(name), `ClearingHouse.${name}`).toBe(true);
    }
  });

  it("carries no tab-era entries", () => {
    const core = functionNames(core4micaAbi);
    for (const gone of ["remunerate", "payTabInERC20Token", "recordPayment"]) {
      expect(core.has(gone), gone).toBe(false);
    }
  });
});
