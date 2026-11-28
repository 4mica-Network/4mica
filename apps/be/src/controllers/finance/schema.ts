import * as v from "valibot";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;

const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2}))?$/;

const isDateOnly = (value: string): boolean => value.length === 10;

const startOf = (value: string): Date =>
  new Date(isDateOnly(value) ? `${value}T00:00:00.000Z` : value);

const isRealInstant = (value: string): boolean => {
  const date = startOf(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return !isDateOnly(value) || date.toISOString().slice(0, 10) === value;
};

export const isoInstant = v.pipe(
  v.string(),
  v.trim(),
  v.regex(ISO_INSTANT, "must be an ISO 8601 date or timestamp"),
  v.check(isRealInstant, "must be a real date"),
);

export const rangeStart = (value: string): Date => startOf(value);

export const rangeEnd = (value: string): Date =>
  isDateOnly(value)
    ? new Date(startOf(value).getTime() + DAY_MS)
    : startOf(value);

export interface DateRange {
  from: Date;
  to: Date;
}

export type RangeResult =
  | { ok: true; range: DateRange }
  | { ok: false; path: "from" | "to"; message: string };

export const resolveRange = (
  input: { from?: string; to?: string },
  now = new Date(),
): RangeResult => {
  const to = input.to ? rangeEnd(input.to) : now;
  const from = input.from
    ? rangeStart(input.from)
    : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);

  if (from >= to) {
    return { ok: false, path: "from", message: "must be before to" };
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    return {
      ok: false,
      path: "to",
      message: `the range can span at most ${MAX_RANGE_DAYS} days`,
    };
  }
  return { ok: true, range: { from, to } };
};

const range = {
  from: v.optional(isoInstant),
  to: v.optional(isoInstant),
};

export const FinanceRangeQuerySchema = v.object(range);

export const USAGE_GROUPS = [
  "project",
  "agent",
  "api_key",
  "listing",
  "recipient",
] as const;

export const UsageGroupSchema = v.picklist(USAGE_GROUPS);
export const UsageDirectionSchema = v.picklist(["sent", "received"]);
export const ExportDirectionSchema = v.picklist(["sent", "received", "all"]);

export const UsageQuerySchema = v.pipe(
  v.object({
    ...range,
    groupBy: v.optional(UsageGroupSchema, "project"),
    direction: v.optional(UsageDirectionSchema, "sent"),
  }),
  v.forward(
    v.check(
      (input) => !(input.direction === "sent" && input.groupBy === "listing"),
      "listing grouping applies to received payments only",
    ),
    ["groupBy"],
  ),
);

export const PaymentsExportQuerySchema = v.object({
  ...range,
  direction: v.optional(ExportDirectionSchema, "all"),
});

export type UsageQuery = v.InferOutput<typeof UsageQuerySchema>;
export type UsageGroup = v.InferOutput<typeof UsageGroupSchema>;
export type UsageDirection = v.InferOutput<typeof UsageDirectionSchema>;
export type ExportDirection = v.InferOutput<typeof ExportDirectionSchema>;
