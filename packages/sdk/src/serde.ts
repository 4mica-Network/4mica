export type RecordValue = Record<string, unknown>;

export const isRecord = (value: unknown): value is RecordValue =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function getAny<T>(raw: RecordValue, ...keys: string[]): T | undefined {
  for (const key of keys) {
    if (key in raw) return raw[key] as T;
  }
  return undefined;
}

export function readString(
  value: unknown,
  label: string,
  onError: (label: string) => Error,
): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  throw onError(label);
}

export function readNumber(
  value: unknown,
  label: string,
  onError: (label: string) => Error,
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw onError(label);
}
