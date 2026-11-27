import { describe, expect, it } from "vitest";
import { fromUnits, toUnits } from "./units";

describe("units", () => {
  it("round-trips decimal strings at 18 places", () => {
    for (const value of ["0", "1", "25", "0.5", "1.000000000000000001"]) {
      expect(fromUnits(toUnits(value))).toBe(value);
    }
  });

  it("reads Decimal-like values and trailing zeros", () => {
    expect(toUnits({ toFixed: () => "2.500" } as never)).toBe(toUnits("2.5"));
    expect(fromUnits(toUnits("10.10"))).toBe("10.1");
  });

  it("adds without floating point error", () => {
    expect(fromUnits(toUnits("0.1") + toUnits("0.2"))).toBe("0.3");
  });
});
