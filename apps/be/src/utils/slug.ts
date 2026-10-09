import { SLUG_MAX_LENGTH } from "@4mica/rules";

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
