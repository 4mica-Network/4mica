import { describe, expect, it } from "vitest";
import en from "./en.json";
import i18n from "./index";

const keys = en as Record<string, string>;

describe("translation catalogue", () => {
  it("has no key whose value is still the key", () => {
    const unfilled = Object.entries(keys).filter(
      ([key, value]) => key === value,
    );

    expect(unfilled).toEqual([]);
  });

  it("has no blank copy", () => {
    const blank = Object.keys(keys).filter((key) => keys[key].trim() === "");

    expect(blank).toEqual([]);
  });

  describe("plural forms resolve", () => {
    const cases = [
      ["apiListing.row.endpointCount", 1, "1 endpoint"],
      ["apiListing.row.endpointCount", 3, "3 endpoints"],
      ["store.apiListing.batchDeletedBody", 1, "1 API was removed."],
      ["store.apiListing.batchDeletedBody", 4, "4 APIs were removed."],
      ["store.agent.batchDeletedBody", 1, "1 agent was removed."],
      ["store.agent.batchDeletedBody", 2, "2 agents were removed."],
    ] as const;

    for (const [key, count, expected] of cases) {
      it(`${key} at ${count}`, () => {
        expect(i18n.t(key, { count })).toBe(expected);
      });
    }
  });

  it("interpolates the values the pages pass", () => {
    expect(i18n.t("apiListing.row.perCall", { price: "$0.01" })).toBe(
      "$0.01 per call",
    );
    expect(
      i18n.t("apiListing.delete.body", { name: "Credit Limits" }),
    ).toContain("Credit Limits");
    expect(
      i18n.t("apiListing.create.fields.slug.description", {
        url: "https://4mica.io/mo/api/credit-limits",
      }),
    ).toContain("https://4mica.io/mo/api/credit-limits");
  });

  it("defines both plural forms wherever it defines one", () => {
    const stems = new Set(
      Object.keys(keys)
        .filter((key) => key.endsWith("_one") || key.endsWith("_other"))
        .map((key) => key.replace(/_(one|other)$/, "")),
    );

    const incomplete = [...stems].filter(
      (stem) => !(`${stem}_one` in keys) || !(`${stem}_other` in keys),
    );

    expect(incomplete).toEqual([]);
  });
});
