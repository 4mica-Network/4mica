import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const API_KEY_PREFIX = "4mica_sk";
const WEBHOOK_SECRET_PREFIX = "whsec";

export interface GeneratedSecret {
  /** Returned to the caller once and never stored. */
  plaintext: string;
  hash: string;
  prefix: string;
  last4: string;
}

export const hashSecret = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** Constant-time comparison so a hash never leaks via response timing. */
export const secretMatches = (value: string, hash: string): boolean => {
  const candidate = Buffer.from(hashSecret(value), "hex");
  const expected = Buffer.from(hash, "hex");

  if (candidate.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(candidate, expected);
};

const generate = (namespace: string): GeneratedSecret => {
  const body = randomBytes(32).toString("base64url");
  const plaintext = `${namespace}_${body}`;

  return {
    plaintext,
    hash: hashSecret(plaintext),
    prefix: `${namespace}_${body.slice(0, 4)}`,
    last4: body.slice(-4),
  };
};

export const generateApiKey = (): GeneratedSecret => generate(API_KEY_PREFIX);

export const generateWebhookSecret = (): GeneratedSecret =>
  generate(WEBHOOK_SECRET_PREFIX);
