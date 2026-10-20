import { USERNAME_PATTERN } from "@4mica/url";
import { isUuidShaped } from "./validation";

export const SLUG_MAX_LENGTH = 64;
export const SLUG_MESSAGE = "must use lowercase letters, numbers, - or _";

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
