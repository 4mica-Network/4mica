import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@config/index";

const VERSION = "v1";

const b64url = (value: Buffer | string): string =>
  Buffer.from(value).toString("base64url");

const sign = (userId: string, secret: string): string =>
  createHmac("sha256", secret)
    .update(`${VERSION}:${userId}`)
    .digest("base64url");

export const signUnsubscribeToken = (userId: string): string | null => {
  const secret = config.onboarding.unsubscribeSecret;

  if (!secret) {
    return null;
  }

  return `${VERSION}.${b64url(userId)}.${sign(userId, secret)}`;
};

export const verifyUnsubscribeToken = (token: string): string | null => {
  const secret = config.onboarding.unsubscribeSecret;

  if (!secret) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [version, encodedUserId, signature] = parts;

  if (version !== VERSION || !encodedUserId || !signature) {
    return null;
  }

  let userId: string;

  try {
    userId = Buffer.from(encodedUserId, "base64url").toString("utf8");
  } catch {
    return null;
  }

  if (!userId) {
    return null;
  }

  const candidate = Buffer.from(signature);
  const expected = Buffer.from(sign(userId, secret));

  if (candidate.length !== expected.length) {
    return null;
  }

  return timingSafeEqual(candidate, expected) ? userId : null;
};

export const unsubscribeUrlFor = (userId: string): string | null => {
  const token = signUnsubscribeToken(userId);

  return token
    ? `${config.publicApiUrl}/unsubscribe?token=${encodeURIComponent(token)}`
    : null;
};
