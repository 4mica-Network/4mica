import { describe, expect, it } from "vitest";
import { commentLine, formatPrice, joinUrl, trimAmount } from "./shared";

describe("joinUrl", () => {
  it("collapses the slashes between base and path", () => {
    expect(joinUrl("https://api.x.io/v1", "/limits")).toBe(
      "https://api.x.io/v1/limits",
    );
    expect(joinUrl("https://api.x.io/v1/", "limits")).toBe(
      "https://api.x.io/v1/limits",
    );
    expect(joinUrl("https://api.x.io/v1/", "/limits")).toBe(
      "https://api.x.io/v1/limits",
    );
  });

  it("returns the bare base when there is no path", () => {
    expect(joinUrl("https://api.x.io/v1", "")).toBe("https://api.x.io/v1");
    expect(joinUrl("https://api.x.io/v1/", "/")).toBe("https://api.x.io/v1");
  });
});

describe("trimAmount", () => {
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

describe("formatPrice", () => {
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

describe("commentLine", () => {
  it("joins the present parts and drops the nulls", () => {
    expect(commentLine(["Credit API", null, "$0.01 per call"])).toBe(
      "// Credit API · $0.01 per call",
    );
  });
});
