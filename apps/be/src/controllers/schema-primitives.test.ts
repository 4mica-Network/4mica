import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  email,
  futureTimestamp,
  httpsUrl,
  phoneNumber,
  publicHttpsUrl,
  singleLine,
  webUrl,
} from "./schema-primitives";

const parse = <T extends v.GenericSchema>(schema: T, input: unknown) =>
  v.safeParse(schema, input);

describe("webUrl", () => {
  it("stores the normalised form", () => {
    const result = parse(webUrl(2048), ' https://x.example/a"b`c ');

    expect(result.success && result.output).toBe("https://x.example/a%22b%60c");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "https://x.example/a b",
    "https://x.example/\nnext",
  ])("rejects %s", (value) => {
    expect(parse(webUrl(2048), value).success).toBe(false);
  });
});

describe("httpsUrl", () => {
  it("rejects plain http", () => {
    expect(parse(httpsUrl(2048), "http://x.example").success).toBe(false);
  });
});

describe("publicHttpsUrl", () => {
  it.each([
    "https://localhost/hook",
    "https://127.0.0.1/hook",
    "https://2130706433/hook",
    "https://169.254.169.254/latest",
    "https://[::1]/hook",
    "https://svc.internal/hook",
  ])("refuses the private target %s", (value) => {
    expect(parse(publicHttpsUrl(2048), value).success).toBe(false);
  });

  it("accepts a public host", () => {
    expect(
      parse(publicHttpsUrl(2048), "https://hooks.example.com").success,
    ).toBe(true);
  });
});

describe("singleLine", () => {
  const schema = v.pipe(v.string(), singleLine);

  it("refuses line breaks and control characters", () => {
    expect(parse(schema, "a\nb").success).toBe(false);
    expect(parse(schema, "a b").success).toBe(false);
    expect(parse(schema, "a\u0000b").success).toBe(false);
    expect(parse(schema, "plain text").success).toBe(true);
  });
});

describe("email", () => {
  it("lowercases so case variants cannot dodge uniqueness", () => {
    const result = parse(email(255), " Mo@Example.COM ");

    expect(result.success && result.output).toBe("mo@example.com");
  });
});

describe("phoneNumber", () => {
  it("accepts a formatted number and rejects letters", () => {
    expect(parse(phoneNumber, "+44 (20) 7946-0958").success).toBe(true);
    expect(parse(phoneNumber, "call me").success).toBe(false);
  });
});

describe("futureTimestamp", () => {
  it("refuses a time in the past", () => {
    expect(parse(futureTimestamp, "2000-01-01T00:00:00.000Z").success).toBe(
      false,
    );
  });
});
