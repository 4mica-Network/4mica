import { currentLocale } from "@/i18n/locale";

const EMPTY = "—";

export const formatDate = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString(currentLocale(), { dateStyle: "medium" })
    : EMPTY;

export const formatDateTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString(currentLocale(), {
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
