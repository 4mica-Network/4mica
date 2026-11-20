import { describe, expect, it, vi } from "vitest";
import { hoistCommand, normalizeArgv } from "./argv.js";

const config = {
  commands: [
    {
      flags: {
        network: { type: "option" },
        asset: { type: "option", char: "a" },
        json: { type: "boolean" },
        yes: { type: "boolean", char: "y" },
      },
    },
  ],
} as unknown as Parameters<typeof hoistCommand>[1];

describe("hoistCommand", () => {
  it("moves flags typed before the command behind it", () => {
    expect(hoistCommand(["--json", "networks"], config)).toEqual([
      "networks",
      "--json",
    ]);
  });

  it("keeps a flag together with its value", () => {
    expect(
      hoistCommand(["--network", "base", "-a", "USDC", "balance"], config),
    ).toEqual(["balance", "--network", "base", "-a", "USDC"]);
    expect(hoistCommand(["--network=base", "tokens"], config)).toEqual([
      "tokens",
      "--network=base",
    ]);
  });

  it("keeps a two-word command and its own flags in order", () => {
    expect(
      hoistCommand(["-y", "withdrawals", "request", "5", "--json"], config),
    ).toEqual(["withdrawals", "request", "5", "--json", "-y"]);
  });

  it("does not move flags past a -- separator", () => {
    expect(hoistCommand(["--json", "dev", "--", "--port"], config)).toEqual([
      "dev",
      "--json",
      "--",
      "--port",
    ]);
  });

  it.each([
    [["networks", "--json"]],
    [["--help"]],
    [["--version"]],
    [[]],
  ])("leaves %j alone", (argv) => {
    expect(hoistCommand(argv, config)).toEqual(argv);
  });
});

describe("normalizeArgv", () => {
  it("still scaffolds on a bare invocation in a terminal, and says so", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    expect(normalizeArgv([], config, true)).toEqual(["init"]);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("4mica init"));
    stderr.mockRestore();
  });

  it("prints help on a bare invocation with no one to answer prompts", () => {
    expect(normalizeArgv([], config, false)).toEqual([]);
  });
});
