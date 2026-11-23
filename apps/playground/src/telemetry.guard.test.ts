import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname);
const TELEMETRY_DIR = path.join(SRC, "lib", "telemetry");

const FORBIDDEN: Array<[string, RegExp]> = [
  ["custom context", /\.setContext\s*\(/],
  ["custom tag", /\.setTags?\s*\(/],
  ["extra data", /\.setExtras?\s*\(/],
  ["user data", /\.setUser\s*\(/],
  ["breadcrumb", /\baddBreadcrumb\s*\(/],
  ["span or scope attribute", /\.setAttributes?\s*\(/],
  ["Sentry logger", /\bSentry\.logger\b/],
  ["Sentry metrics", /\bSentry\.metrics\b/],
  ["custom span", /\bSentry\.start(?:Span|InactiveSpan|SpanManual)\s*\(/],
  ["free-text message", /\bcaptureMessage\s*\(/],
  [
    "Sentry log or metric import",
    /import\s*\{[^}]*\b(?:logger|metrics)\b[^}]*\}\s*from\s*["']@sentry\//,
  ],
];

const SOURCE = /\.(?:ts|tsx|js|jsx|mjs)$/;
const TEST = /\.test\.(?:ts|tsx)$/;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return full === TELEMETRY_DIR ? [] : sourceFiles(full);
    }

    return SOURCE.test(entry.name) && !TEST.test(entry.name) ? [full] : [];
  });

export const findViolations = (code: string): string[] =>
  FORBIDDEN.filter(([, pattern]) => pattern.test(code)).map(([name]) => name);

describe("telemetry guard", () => {
  it("detects every forbidden telemetry API", () => {
    const samples = [
      'Sentry.setContext("payment", payment)',
      "scope.setTag('merchant', ref)",
      "Sentry.setTags({ a: 1 })",
      "scope.setExtra('payment', p)",
      "Sentry.setUser({ id })",
      "Sentry.addBreadcrumb({ data })",
      "span.setAttribute('card', n)",
      "Sentry.logger.info('x', payload)",
      "Sentry.metrics.count('x', 1)",
      "Sentry.startSpan({ attributes }, fn)",
      "Sentry.captureMessage(text)",
      'import { logger } from "@sentry/nextjs"',
    ];

    for (const sample of samples) {
      expect(findViolations(sample), sample).not.toEqual([]);
    }

    expect(findViolations("Sentry.captureException(error)")).toEqual([]);
    expect(findViolations("appLogger.info('x', { requestId })")).toEqual([]);
  });

  it("allows custom Sentry payloads only inside src/lib/telemetry", () => {
    const offenders = sourceFiles(SRC)
      .map((file) => ({
        file: path.relative(SRC, file),
        violations: findViolations(readFileSync(file, "utf8")),
      }))
      .filter(({ violations }) => violations.length > 0);

    expect(offenders).toEqual([]);
  });
});
