import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { HttpsUrlOrNullSchema } from "./params";

describe("HttpsUrlOrNullSchema", () => {
  it("keeps an https URL", () => {
    expect(v.parse(HttpsUrlOrNullSchema, "https://docs.example.com/a")).toBe(
      "https://docs.example.com/a",
    );
  });

  it.each([
    "http://docs.example.com",
    "javascript:alert(1)",
    "data:text/html,x",
    "//example.com",
    "",
    null,
  ])("turns %s into null", (value) => {
    expect(v.parse(HttpsUrlOrNullSchema, value)).toBeNull();
  });
});
