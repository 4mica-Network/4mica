export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: string }).code === "P2002";

const asStrings = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return typeof value === "string" ? [value] : [];
};

export const uniqueViolationTargets = (error: unknown): string[] => {
  const meta = (error as { meta?: Record<string, unknown> })?.meta;
  const fromTarget = asStrings(meta?.target);

  if (fromTarget.length > 0) {
    return fromTarget;
  }

  const adapter = meta?.driverAdapterError as
    | { cause?: { constraint?: { fields?: unknown; index?: unknown } } }
    | undefined;
  const constraint = adapter?.cause?.constraint;

  return asStrings(constraint?.fields ?? constraint?.index);
};

export const uniqueViolationTarget = (error: unknown): string => {
  const targets = uniqueViolationTargets(error);
  return targets.length > 0 ? targets.join(", ") : "field";
};
