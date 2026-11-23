import { describe, expect, it } from "vitest";
import { wantsColor } from "./log.js";

describe("wantsColor", () => {
  it.each([
    // In a terminal, unless told otherwise.
    [{}, [], true, true],
    [{}, [], false, false],
    [{ TERM: "dumb" }, [], true, false],
    // FORCE_COLOR turns it on for a pipe; 0 and false turn it off anywhere.
    [{ FORCE_COLOR: "1" }, [], false, true],
    [{ FORCE_COLOR: "true" }, [], false, true],
    [{ FORCE_COLOR: "3" }, [], false, true],
    [{ FORCE_COLOR: "0" }, [], false, false],
    [{ FORCE_COLOR: "0" }, [], true, false],
    [{ FORCE_COLOR: "false" }, [], true, false],
    [{ FORCE_COLOR: "" }, [], true, true],
    [{ FORCE_COLOR: "" }, [], false, false],
    // Off wins over on, and a flag over a variable.
    [{ NO_COLOR: "1", FORCE_COLOR: "1" }, [], true, false],
    [{ FORCE_COLOR: "1" }, ["--no-color"], true, false],
    [{ FORCE_COLOR: "0" }, ["--color"], false, true],
    [{}, ["--color"], false, true],
  ] as const)("%j %j, terminal: %s → %s", (env, argv, isTTY, expected) => {
    expect(wantsColor(env, argv, isTTY)).toBe(expected);
  });
});
