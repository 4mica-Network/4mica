export const SIGNATURE_HEADER = "X-4mica-Signature";

export const verificationSnippet = (): string =>
  [
    'import { createHmac, timingSafeEqual } from "node:crypto";',
    "",
    "export function verify4micaSignature(rawBody, header, secret) {",
    "  const parts = Object.fromEntries(",
    '    header.split(",").map((part) => part.trim().split("=")),',
    "  );",
    "  const timestamp = Number(parts.t);",
    "  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) {",
    "    return false;",
    "  }",
    '  const expected = createHmac("sha256", secret)',
    '    .update(parts.t + "." + rawBody)',
    '    .digest("hex");',
    '  const received = String(parts.v1 ?? "");',
    "  return (",
    "    received.length === expected.length &&",
    "    timingSafeEqual(Buffer.from(received), Buffer.from(expected))",
    "  );",
    "}",
    "",
    "verify4micaSignature(",
    "  rawBody,",
    `  request.headers["${SIGNATURE_HEADER.toLowerCase()}"],`,
    "  process.env.FOURMICA_AUDIT_STREAM_SECRET,",
    ");",
  ].join("\n");

export const MAX_BACKFILL_DAYS = 90;

export const backfillBounds = (now = new Date()) => {
  const min = new Date(now.getTime() - MAX_BACKFILL_DAYS * 86_400_000);
  return {
    min: min.toISOString().slice(0, 10),
    max: now.toISOString().slice(0, 10),
  };
};

export const parsePrefixes = (raw: string): string[] => [
  ...new Set(
    raw
      .split(/[\s,]+/)
      .map((prefix) => prefix.trim())
      .filter(Boolean),
  ),
];

export const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};
