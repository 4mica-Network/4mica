import { describe, expect, it } from "vitest";
import { definedParams, mirrorKeys, setPending } from "./utils";

describe("store utils", () => {
  it("mirrors keys into a constant map", () => {
    expect(mirrorKeys(["A", "B"] as const)).toEqual({ A: "A", B: "B" });
  });

  it("adds and clears pending keys without mutating", () => {
    const start = { a: true };
    const added = setPending(start, "b", true);
    expect(added).toEqual({ a: true, b: true });
    expect(setPending(added, "a", false)).toEqual({ b: true });
    expect(setPending(start, undefined, true)).toBe(start);
    expect(start).toEqual({ a: true });
  });

  it("drops empty filters from request params", () => {
    expect(
      definedParams({ page: 1, q: "", status: "ACTIVE", network: undefined }),
    ).toEqual({ page: 1, status: "ACTIVE" });
  });
});
