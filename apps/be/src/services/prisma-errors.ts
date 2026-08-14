/**
 * Prisma error shapes, kept here so the auth layer and the controllers agree on
 * what a unique violation looks like without importing each other.
 */

export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: string }).code === "P2002";

/** The column(s) that collided. `meta.target` is an array, a string, or absent. */
export const uniqueViolationTargets = (error: unknown): string[] => {
  const target = (error as { meta?: { target?: unknown } })?.meta?.target;

  if (Array.isArray(target)) {
    return target.filter((value): value is string => typeof value === "string");
  }

  return typeof target === "string" ? [target] : [];
};

/** Human-readable form for the "that X is already taken" responses. */
export const uniqueViolationTarget = (error: unknown): string => {
  const targets = uniqueViolationTargets(error);
  return targets.length > 0 ? targets.join(", ") : "field";
};
