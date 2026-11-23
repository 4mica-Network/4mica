import { afterEach, describe, expect, it } from "vitest";
import { canPrompt, runtime, setRuntimeFlags } from "./runtime.js";

const tty = (stdin: boolean, stderr: boolean) => {
  Object.defineProperty(process.stdin, "isTTY", {
    value: stdin,
    configurable: true,
  });
  Object.defineProperty(process.stderr, "isTTY", {
    value: stderr,
    configurable: true,
  });
};
const before = [process.stdin.isTTY, process.stderr.isTTY] as const;
afterEach(() => {
  tty(...before);
  setRuntimeFlags({});
});

describe("canPrompt", () => {
  it("asks in a terminal", () => {
    tty(true, true);
    expect(canPrompt()).toBe(true);
  });

  it("does not ask where the question would not be seen", () => {
    // `4mica deposit 5 2>deposit.log`: the question is written to stderr.
    tty(true, false);
    expect(canPrompt()).toBe(false);
  });

  it("does not ask where there is no one to answer", () => {
    tty(false, true);
    expect(canPrompt()).toBe(false);
  });

  it("does not ask under --no-input", () => {
    tty(true, true);
    setRuntimeFlags({ "no-input": true });
    expect(canPrompt()).toBe(false);
  });
});

describe("setRuntimeFlags", () => {
  it("takes the parsed flags, and forgets the last command's", () => {
    setRuntimeFlags({ quiet: true, "no-input": true });
    expect(runtime).toEqual({ quiet: true, noInput: true });
    setRuntimeFlags({ yes: true });
    expect(runtime).toEqual({ quiet: false, noInput: false });
  });
});
