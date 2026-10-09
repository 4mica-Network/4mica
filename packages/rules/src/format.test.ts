import { describe, expect, it } from "vitest";
import { formatPrice, trimAmount } from "./format";

describe("trimAmount", () => {
  it("drops the trailing zeros a Decimal(38,18) carries", () => {
    expect(trimAmount("0.010000000000000000")).toBe("0.01");
    expect(trimAmount("1.000000000000000000")).toBe("1");
  });

  it("leaves an integer alone", () => {
    expect(trimAmount("42")).toBe("42");
  });

  it("never returns an empty string", () => {
    expect(trimAmount("0.000000000000000000")).toBe("0");
  });
});

describe("formatPrice", () => {
  it("prefixes USD with a dollar sign", () => {
    expect(formatPrice("1.500", "usd", null)).toBe("$1.5");
  });

  it("suffixes other currencies", () => {
    expect(formatPrice("2", "eth", null)).toBe("2 ETH");
  });

  it("falls back to the label without an amount", () => {
    expect(formatPrice(null, null, "Free")).toBe("Free");
  });
});

describe("trimAmount on Prisma decimals", () => {
  // Decimal(38,18) round-trips with eighteen decimal places.
  it("drops the trailing zeros Postgres pads on", () => {
    expect(trimAmount("0.010000000000000000")).toBe("0.01");
    expect(trimAmount("0.001000000000000000")).toBe("0.001");
    expect(trimAmount("2500.000000000000000000")).toBe("2500");
  });

  it("leaves an integer alone", () => {
    expect(trimAmount("10")).toBe("10");
  });

  it("does not turn a zero into an empty string", () => {
    expect(trimAmount("0.000000000000000000")).toBe("0");
  });
});

describe("formatPrice for snippets", () => {
  it("renders USD with a symbol", () => {
    expect(formatPrice("0.010000000000000000", "USD", null)).toBe("$0.01");
  });

  it("suffixes any other currency", () => {
    expect(formatPrice("0.01", "eur", null)).toBe("0.01 EUR");
  });

  it("falls back to the seller's label when there is no amount", () => {
    expect(formatPrice(null, null, "Usage-based")).toBe("Usage-based");
  });

  it("returns null when neither is set, so callers can omit the clause", () => {
    expect(formatPrice(null, null, null)).toBeNull();
  });

  it("prefers the machine amount over the display label", () => {
    expect(formatPrice("0.05", "USD", "Free in sandbox")).toBe("$0.05");
  });
});
