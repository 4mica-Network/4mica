import { out } from "./log.js";

/**
 * One header row, one record per line, so the output survives `grep`.
 * Columns are padded before color is applied.
 */
export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => row[i]?.length ?? 0)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, i) =>
        i === cells.length - 1 ? cell : cell.padEnd(widths[i]),
      )
      .join("  ")
      .trimEnd();
  return [out.dim(line(headers)), ...rows.map(line)].join("\n");
}

/** `key: value` lines; entries without a value are left out. */
export function fields(entries: [string, string | undefined][]): string {
  return entries
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

/**
 * What `--json` prints: bigints as strings (JSON has none), dates as ISO
 * strings, methods dropped.
 */
export function toPlain(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => typeof v !== "function" && v !== undefined)
        .map(([k, v]) => [k, toPlain(v)]),
    );
  }
  return value;
}
