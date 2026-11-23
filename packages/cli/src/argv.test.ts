import { describe, expect, it, vi } from "vitest";
import { hoistCommand, normalizeArgv } from "./argv.js";

const config = {
  commands: [
    { id: "init", flags: { type: { type: "option" } } },
    { id: "status", flags: {} },
    { id: "withdrawals:request", aliases: ["withdraw"], flags: {} },
    {
      id: "balance",
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

  describe("the scaffolder's arguments with no command, as before 0.3", () => {
    it.each([
      [["--yes"], ["init", "--yes"]],
      [
        ["--type", "seller", "--yes"],
        ["init", "--type", "seller", "--yes"],
      ],
      [
        ["my-app", "--no-install"],
        ["init", "my-app", "--no-install"],
      ],
      [
        ["--yes", "my-app"],
        ["init", "my-app", "--yes"],
      ],
    ])("%j scaffolds, with or without a terminal", (argv, expected) => {
      const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      expect(normalizeArgv(argv, config, false)).toEqual(expected);
      expect(stderr).toHaveBeenCalledWith(
        expect.stringContaining("4mica init"),
      );
      stderr.mockRestore();
    });

    it.each([
      [["--help"]],
      [["-h"]],
      [["--version"]],
      [["--json", "--help"]],
      [["status"]],
      [["withdraw", "5"]],
      [["withdrawals", "request", "5"]],
      // Typos: left for "did you mean", not turned into project names.
      [["statu"]],
      [["balanc", "--json"]],
    ])("%j is left to oclif", (argv) => {
      const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      expect(normalizeArgv(argv, config, true)[0]).not.toBe("init");
      expect(stderr).not.toHaveBeenCalled();
      stderr.mockRestore();
    });
  });
});
