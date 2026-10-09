import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  FileReportSchema,
  ResourceRefSchema,
  SubmitReviewSchema,
} from "./trust";

const parse = <T extends v.GenericSchema>(schema: T, input: unknown) =>
  v.safeParse(schema, input);

describe("SubmitReviewSchema", () => {
  it("accepts a rating on its own", () => {
    const result = parse(SubmitReviewSchema, { rating: 4 });

    expect(result.success).toBe(true);
    expect(result.success && result.output).toEqual({
      rating: 4,
      title: null,
      body: null,
    });
  });

  it("accepts a rating sent as a string, as a form would", () => {
    const result = parse(SubmitReviewSchema, { rating: "5" });

    expect(result.success && result.output.rating).toBe(5);
  });

  it.each([0, 6, -1, 2.5])("rejects %s as a rating", (rating) => {
    expect(parse(SubmitReviewSchema, { rating }).success).toBe(false);
  });

  it("turns blank text into null rather than storing whitespace", () => {
    const result = parse(SubmitReviewSchema, {
      rating: 3,
      title: "   ",
      body: "",
    });

    expect(result.success && result.output.title).toBeNull();
    expect(result.success && result.output.body).toBeNull();
  });

  it("rejects a body longer than the column", () => {
    const result = parse(SubmitReviewSchema, {
      rating: 3,
      body: "x".repeat(2001),
    });

    expect(result.success).toBe(false);
  });

  it("requires a rating", () => {
    expect(parse(SubmitReviewSchema, { body: "great" }).success).toBe(false);
  });
});

describe("FileReportSchema", () => {
  it("accepts a known reason", () => {
    const result = parse(FileReportSchema, { reason: "SCAM" });

    expect(result.success).toBe(true);
  });

  it("rejects a reason outside the picklist", () => {
    expect(
      parse(FileReportSchema, { reason: "I_JUST_DONT_LIKE_IT" }).success,
    ).toBe(false);
  });

  it("keeps the detail optional", () => {
    const result = parse(FileReportSchema, { reason: "NOT_WORKING" });

    expect(result.success && result.output.detail).toBeNull();
  });

  it("requires a detail when the reason is OTHER", () => {
    const missing = parse(FileReportSchema, { reason: "OTHER", detail: "  " });

    expect(missing.success).toBe(false);
    expect(!missing.success && v.getDotPath(missing.issues[0])).toBe("detail");
    expect(
      parse(FileReportSchema, { reason: "OTHER", detail: "Charges twice" })
        .success,
    ).toBe(true);
  });
});

describe("ResourceRefSchema", () => {
  const VALID = {
    kind: "agent",
    id: "019fce62-0000-7000-8000-000000000000",
    username: "ada",
    ref: "atlas",
  };

  it("accepts the shape the trust section sends", () => {
    expect(parse(ResourceRefSchema, VALID).success).toBe(true);
  });

  it("rejects anything a crafted request could smuggle in", () => {
    for (const bad of [
      { ...VALID, kind: "user" },
      { ...VALID, id: "not-a-uuid" },
      { ...VALID, username: "../admin" },
      { ...VALID, ref: "atlas/../../settings" },
      null,
    ]) {
      expect(parse(ResourceRefSchema, bad).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
  });
});
