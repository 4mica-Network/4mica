export const DEFAULT_REDIRECT = "/";

const FOREIGN_ORIGIN_PATTERN = /^\/[/\\]/;

// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point.
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;

export const safeRedirectPath = (value: string | null | undefined): string => {
  if (typeof value !== "string") {
    return DEFAULT_REDIRECT;
  }

  const trimmed = value.trim();

  if (
    !trimmed.startsWith("/") ||
    FOREIGN_ORIGIN_PATTERN.test(trimmed) ||
    CONTROL_PATTERN.test(trimmed)
  ) {
    return DEFAULT_REDIRECT;
  }

  return trimmed;
};
