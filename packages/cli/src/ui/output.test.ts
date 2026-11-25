import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { fields, printable, table, toPlain } from "./output.js";

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

  it("lines up a column that mixes colored and plain cells", () => {
    const green = (text: string) => `\u001b[32m${text}\u001b[39m`;
    const lines = table(
      ["CHECK", "STATE", "DETAIL"],
      [
        ["core", green("up"), "ok"],
        ["facilitator", "none", "not hosted"],
      ],
    )
      .split("\n")
      .map(stripVTControlCharacters);
    expect(lines).toEqual([
      "CHECK        STATE  DETAIL",
      "core         up     ok",
      "facilitator  none   not hosted",
    ]);
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

describe("printable", () => {
  it("removes escape sequences and control characters, keeping lines", () => {
    expect(
      printable(
        "a\u001b[31mred\u001b[0m\u001b]0;title\u0007b\tc\nd\u0000\u009b",
      ),
    ).toBe("aredb\tc\nd");
  });

  it("is applied to table cells and fields, keeping the cli's own colors", () => {
    const green = (text: string) => `\u001b[32m${text}\u001b[39m`;
    const hostile = "x\u001b]0;pwned\u0007y";
    const out = table(["A", "B"], [[green("up"), hostile]], { isTTY: false });
    expect(out).toContain(green("up"));
    expect(out).toContain("xy");
    expect(out).not.toContain("pwned\u0007");
    expect(fields([["k", hostile]])).toBe("k: xy");
  });
});

describe("table in a narrow terminal", () => {
  const rows = [
    ["base-sepolia", "https://core.sepolia.example.com/a/very/long/path"],
  ];

  it("prints records as key: value lines when the rows would wrap", () => {
    expect(table(["NAME", "CORE"], rows, { isTTY: true, columns: 40 })).toBe(
      "name: base-sepolia\ncore: https://core.sepolia.example.com/a/very/long/path",
    );
  });

  it("keeps the table in a wide terminal, and always in a pipe", () => {
    expect(
      table(["NAME", "CORE"], rows, { isTTY: true, columns: 200 }),
    ).toContain("NAME");
    expect(
      table(["NAME", "CORE"], rows, { isTTY: false, columns: 40 }),
    ).toContain("NAME");
  });
});
