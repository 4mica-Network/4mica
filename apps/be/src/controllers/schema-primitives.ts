import { isPublicHostname } from "@utils/public-host";
import * as v from "valibot";
import { isAddress } from "viem";

export const PaymentNetworkSchema = v.picklist([
  "BASE",
  "BASE_SEPOLIA",
  "ETHEREUM_SEPOLIA",
]);

export const PublicVisibilitySchema = v.picklist([
  "PRIVATE",
  "UNLISTED",
  "PUBLIC",
]);

export const HttpMethodSchema = v.picklist([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export const address = v.pipe(
  v.string(),
  v.trim(),
  v.check(
    (value) => isAddress(value, { strict: true }),
    "must be a valid EIP-55 checksummed address",
  ),
  v.transform((value) => value.toLowerCase()),
);

const CONTROL_CHARACTERS = /[\p{Cc}\u2028\u2029]/u;
const SPACE_OR_CONTROL = /[\s\p{Cc}]/u;

export const singleLine = v.check(
  (value: string) => !CONTROL_CHARACTERS.test(value),
  "must be a single line of text",
);

export const isWebUrl = (value: string): boolean => {
  if (SPACE_OR_CONTROL.test(value)) {
    return false;
  }

  try {
    const { protocol, hostname } = new URL(value);
    return (protocol === "https:" || protocol === "http:") && hostname !== "";
  } catch {
    return false;
  }
};

export const normalizeUrl = (value: string): string => new URL(value).href;

/**
 * An http(s) URL and nothing else. `v.url()` alone is only `new URL()`, which
 * happily accepts `javascript:` and `data:` — and these values end up in
 * `href`/`src` attributes, sometimes on another account's screen.
 */
export const webUrl = (max: number) =>
  v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(max),
    v.check(isWebUrl, "must be an http:// or https:// URL"),
    v.transform(normalizeUrl),
    v.maxLength(max),
  );

export const httpsUrl = (max: number) =>
  v.pipe(
    webUrl(max),
    v.check((value) => value.startsWith("https://"), "must be an https URL"),
  );

export const publicHttpsUrl = (max: number) =>
  v.pipe(
    httpsUrl(max),
    v.check(
      (value) => isPublicHostname(new URL(value).hostname),
      "must point to a public host, not a private or local address",
    ),
  );

export const email = (max: number) =>
  v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email(), v.maxLength(max));

export const PHONE_PATTERN = /^\+?[0-9 ()-]{6,20}$/;

export const phoneNumber = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(20),
  v.regex(PHONE_PATTERN, "must be a valid phone number"),
);

export const decimalAmount = v.pipe(
  v.string(),
  v.trim(),
  v.regex(
    /^(?!0\d)\d{1,20}(\.\d{1,18})?$/,
    "must be a decimal amount, as a string",
  ),
);

export const couponCode = v.pipe(
  v.string(),
  v.trim(),
  v.toUpperCase(),
  v.minLength(1),
  v.maxLength(64),
  v.regex(/^[A-Z0-9][A-Z0-9_-]*$/, "may use letters, numbers, - and _"),
);

export const positiveDecimalAmount = v.pipe(
  decimalAmount,
  v.check((value) => Number(value) > 0, "must be greater than zero"),
);

export const futureTimestamp = v.pipe(
  v.string(),
  v.isoTimestamp(),
  v.check(
    (value) => new Date(value).getTime() > Date.now(),
    "must be in the future",
  ),
);

export const MAX_INT32 = 2_147_483_647;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_OFFSET = 10_000;
export const MAX_BATCH_DELETE = 100;

export const positiveInt = (fallback: number, max: number) =>
  v.optional(
    v.pipe(
      v.union([v.string(), v.number()]),
      v.transform(Number),
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(max),
    ),
    fallback,
  );

export const batchDeleteSchema = (what: string) =>
  v.object({
    ids: v.pipe(
      v.array(v.pipe(v.string(), v.uuid(`must be ${what}`))),
      v.minLength(1, "select at least one"),
      v.maxLength(MAX_BATCH_DELETE),
      v.transform((ids) => [...new Set(ids)]),
    ),
  });
