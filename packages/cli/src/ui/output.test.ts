import { describe, expect, it } from "vitest";
import { fields, table, toPlain } from "./output.js";

describe("table", () => {
  it("prints one header row and one record per line, without trailing spaces", () => {
    const lines = table(
      ["ASSET", "TOTAL"],
      [
        ["USDC", "25"],
        ["ETH", "0.1"],
      ],
    ).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("USDC   25");
    expect(lines[2]).toBe("ETH    0.1");
  });
});

describe("fields", () => {
  it("leaves out entries with no value", () => {
    expect(
      fields([
        ["a", "1"],
        ["b", undefined],
        ["c", ""],
      ]),
    ).toBe("a: 1");
  });
});

describe("toPlain", () => {
  it("makes an SDK result safe for JSON.stringify", () => {
    const plain = toPlain({
      amountRaw: 5_000_000n,
      readyAt: new Date("2026-01-02T03:04:05Z"),
      spendable: () => undefined,
      nested: [{ raw: 1n }],
    });
    expect(plain).toEqual({
      amountRaw: "5000000",
      readyAt: "2026-01-02T03:04:05.000Z",
      nested: [{ raw: "1" }],
    });
    expect(() => JSON.stringify(plain)).not.toThrow();
  });
});
