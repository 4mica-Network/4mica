import { expect } from "vitest";

/**
 * The fields of a value and the type of each, with the values themselves
 * left out: `{ txHash: "0xfeed", amount: "5" }` is
 * `{ amount: "string", txHash: "string" }`. A list is described by its
 * first entry.
 */
export function shape(value: unknown): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length === 0 ? [] : [shape(value[0])];
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((key) => [key, shape((value as Record<string, unknown>)[key])]),
    );
  }
  return typeof value;
}

/**
 * Pins what a command prints with `--json`: its field names and their
 * types. Renaming or dropping a field fails here, where it can be weighed,
 * rather than in someone's script. `cli.contract.test.ts` checks that every
 * command with `--json` is pinned somewhere.
 *
 * `variant` tells apart the shapes one command has, such as a dry run.
 */
export function pinJson(command: string, json: unknown, variant?: string) {
  expect(shape(json)).toMatchSnapshot(
    `json shape: ${command}${variant ? ` (${variant})` : ""}`,
  );
}
