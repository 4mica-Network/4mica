import { USERNAME_PATTERN } from "@4mica/url";

export const SLUG_MAX_LENGTH = 64;
export const SLUG_MESSAGE = "must use lowercase letters, numbers, - or _";

export const isUuidShaped = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const isValidSlug = (value: string): boolean =>
  value.length > 0 &&
  value.length <= SLUG_MAX_LENGTH &&
  USERNAME_PATTERN.test(value) &&
  !isUuidShaped(value);

export const slugify = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");

export const nextFreeSlug = (base: string, taken: Set<string>): string => {
  const fallback = base.length > 0 ? base : "untitled";
  if (!taken.has(fallback)) {
    return fallback;
  }

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const tail = `-${suffix}`;
    const candidate = `${fallback.slice(0, SLUG_MAX_LENGTH - tail.length)}${tail}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return `${fallback.slice(0, SLUG_MAX_LENGTH - 14)}-${Date.now().toString(36)}`;
};
