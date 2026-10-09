import { describe, expect, it } from "vitest";
import {
  blankFieldsToNull,
  blankToNull,
  formatDate,
  formatDateTime,
} from "./format";

describe("dates", () => {
  it("renders a dash for a missing date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime(null)).toBe("—");
  });

  it("formats a present date", () => {
    expect(formatDate("2026-01-02T00:00:00.000Z")).not.toBe("—");
  });
});

describe("blankToNull", () => {
  it("trims and nulls blanks", () => {
    expect(blankToNull("  ")).toBeNull();
    expect(blankToNull(undefined)).toBeNull();
    expect(blankToNull(" a ")).toBe("a");
  });

  it("nulls blank fields except the kept ones", () => {
    expect(blankFieldsToNull({ a: "", b: "", c: 1 }, ["b"])).toEqual({
      a: null,
      b: "",
      c: 1,
    });
  });
});
