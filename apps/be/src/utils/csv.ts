import type { FastifyReply } from "fastify";

export const CSV_ROW_LIMIT = 50_000;

export type CsvValue = string | number | boolean | Date | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

export const csvCell = (value: CsvValue): string => {
  if (value === null || value === undefined) {
    return "";
  }

  const text = value instanceof Date ? value.toISOString() : String(value);
  const safe = FORMULA_START.test(text) ? `'${text}` : text;

  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const csvLine = (values: readonly CsvValue[]): string =>
  `${values.map(csvCell).join(",")}\r\n`;

export const csvDocument = (
  header: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): string => [header, ...rows].map(csvLine).join("");

export const sendCsv = (
  reply: FastifyReply,
  filename: string,
  header: readonly string[],
  rows: readonly (readonly CsvValue[])[],
  truncated: boolean,
) => {
  reply
    .code(200)
    .header("content-type", "text/csv; charset=utf-8")
    .header("content-disposition", `attachment; filename="${filename}"`)
    .header("cache-control", "no-store")
    .header("x-content-type-options", "nosniff")
    .header("x-row-limit", String(CSV_ROW_LIMIT))
    .header("x-truncated", truncated ? "true" : "false");

  return reply.send(csvDocument(header, rows));
};
