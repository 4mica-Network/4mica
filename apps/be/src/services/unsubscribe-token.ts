import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@config/index";

/**
 * Signed, stateless unsubscribe tokens.
 *
 * HMAC rather than a stored hash — the same URL has to be regenerable for all
 * thirty emails, including one sent three months ago. A stored *hash* cannot
 * regenerate a URL, and storing the plaintext would break the convention every
 * other secret in `secrets.ts` follows. Signing needs no column and no lookup.
 *
 * The version prefix exists so rotating `UNSUBSCRIBE_SECRET` can become a `v2`
 * with dual verification, rather than invalidating every link already sitting
 * in somebody's inbox.
 */
const VERSION = "v1";

const b64url = (value: Buffer | string): string =>
  Buffer.from(value).toString("base64url");

const sign = (userId: string, secret: string): string =>
  createHmac("sha256", secret)
    .update(`${VERSION}:${userId}`)
    .digest("base64url");

/** `v1.<base64url(userId)>.<base64url(hmac)>`, or null when unconfigured. */
export const signUnsubscribeToken = (userId: string): string | null => {
  const secret = config.onboarding.unsubscribeSecret;

  if (!secret) {
    return null;
  }

  return `${VERSION}.${b64url(userId)}.${sign(userId, secret)}`;
};

/** The user id the token vouches for, or null if it does not verify. */
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

  // Length check first: timingSafeEqual throws on a mismatch.
  if (candidate.length !== expected.length) {
    return null;
  }

  return timingSafeEqual(candidate, expected) ? userId : null;
};

/** The absolute URL that goes into the email footer and the RFC 8058 header. */
export const unsubscribeUrlFor = (userId: string): string | null => {
  const token = signUnsubscribeToken(userId);

  return token
    ? `${config.publicApiUrl}/unsubscribe?token=${encodeURIComponent(token)}`
    : null;
};
