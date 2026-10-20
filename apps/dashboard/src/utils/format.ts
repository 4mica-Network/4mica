const EMPTY = "—";

export const formatDate = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" })
    : EMPTY;

export const formatDateTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : EMPTY;

export const blankToNull = (value: string | undefined | null): string | null =>
  value == null || value.trim() === "" ? null : value.trim();

export const blankFieldsToNull = (
  changes: Record<string, unknown>,
  keep: string[] = [],
) =>
  Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [
      key,
      value === "" && !keep.includes(key) ? null : value,
    ]),
  );
