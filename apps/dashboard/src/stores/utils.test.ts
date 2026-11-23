import { describe, expect, it } from "vitest";
import { definedParams, mirrorKeys, pageBeyondEnd, setPending } from "./utils";

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

describe("pageBeyondEnd", () => {
  const result = (page: number, total: number, items: unknown[] = []) => ({
    items,
    total,
    page,
    limit: 20,
  });

  it("steps back to the last page when the current one has emptied", () => {
    expect(pageBeyondEnd(result(3, 40))).toBe(2);
    expect(pageBeyondEnd(result(5, 1))).toBe(1);
  });

  it("leaves a page alone when it has rows, is the first, or nothing exists", () => {
    expect(pageBeyondEnd(result(2, 40, [{}]))).toBeNull();
    expect(pageBeyondEnd(result(1, 40))).toBeNull();
    expect(pageBeyondEnd(result(3, 0))).toBeNull();
  });
});
