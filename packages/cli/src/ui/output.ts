import { stripVTControlCharacters } from "node:util";
import { out } from "./log.js";

/**
 * Text that came from off this machine, made safe to print: escape
 * sequences and every other control character removed, newlines and tabs
 * kept. A server's error message or a token's name could otherwise recolor
 * the screen, retitle the window, or rewrite the amount shown above it.
 */
export function printable(text: string): string {
  return (
    stripVTControlCharacters(text)
      // C0 except tab and newline, DEL, and C1.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "")
  );
}

/** The room a cell takes on screen: its color codes take none. */
const width = (cell = "") => stripVTControlCharacters(cell).length;

/**
 * One header row, one record per line, so the output survives `grep`.
 * A cell may arrive colored; columns are padded to what is seen.
 *
 * In a terminal too narrow for the rows, each record is printed as
 * `key: value` lines instead, so nothing wraps mid-row. Piped output is
 * always the table: a script reads the same thing at any width.
 */
export function table(
  headers: string[],
  rows: string[][],
  screen: { isTTY?: boolean; columns?: number } = process.stdout,
): string {
  const clean = rows.map((row) => row.map(printableCell));
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...clean.map((row) => width(row[i]))),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, i) =>
        i === cells.length - 1
          ? cell
          : cell + " ".repeat(widths[i] - width(cell)),
      )
      .join("  ")
      .trimEnd();
  const lines = [out.dim(line(headers)), ...clean.map(line)];
  const columns = screen.columns ?? 0;
  if (
    screen.isTTY !== true ||
    columns === 0 ||
    lines.every((l) => width(l) <= columns)
  ) {
    return lines.join("\n");
  }
  return clean
    .map((row) =>
      fields(
        headers.map((header, i): [string, string] => [
          header.toLowerCase(),
          row[i] ?? "",
        ]),
      ),
    )
    .join("\n\n");
}

/** A cell with the CLI's own colors kept, and anything else removed. */
function printableCell(cell = ""): string {
  // Colors are applied by this CLI after the text arrives, so a cell that
  // carries them is ours; strip only control characters left outside them.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: escape sequences
  const parts = cell.split(/(\u001b\[[0-9;]*m)/);
  return parts
    .map((part, i) => (i % 2 === 1 ? part : printable(part)))
    .join("");
}

/** `key: value` lines; entries without a value are left out. */
export function fields(entries: [string, string | undefined][]): string {
  return entries
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${printableCell(value)}`)
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
