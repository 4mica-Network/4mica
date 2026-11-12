import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = path.resolve(__dirname);

const SENSITIVE_SEGMENT =
  /token|secret|code|key|passw|reset|session|otp|nonce|signature|credential|invite|verify|magic/i;

const dynamicSegments = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const nested = dynamicSegments(path.join(dir, entry.name));
      return /^\[.+\]$/.test(entry.name) ? [entry.name, ...nested] : nested;
    });

describe("app routes", () => {
  it("has dynamic segments", () => {
    expect(dynamicSegments(APP_DIR).length).toBeGreaterThan(0);
  });

  it("never carries credentials in a dynamic URL segment, which telemetry records as the raw path", () => {
    const offending = dynamicSegments(APP_DIR).filter((segment) =>
      SENSITIVE_SEGMENT.test(segment),
    );

    expect(offending).toEqual([]);
  });
});
