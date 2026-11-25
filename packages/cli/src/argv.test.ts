import { describe, expect, it, vi } from "vitest";
import {
  distance,
  hoistCommand,
  nearestCommand,
  normalizeArgv,
} from "./argv.js";

const config = {
  commands: [
    { id: "init", flags: { type: { type: "option" } } },
    { id: "status", flags: {} },
    { id: "dev", flags: {} },
    { id: "help", flags: {} },
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
    // The notice says when the old form goes.
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("0.5.0"));
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
      [["staus"]],
      // One slip from a short command, swapped letters included.
      [["dve"]],
      [["inti", "--yes"]],
      [["hepl"]],
      [["de"]],
      // A word alone is a command, known or not: never a project.
      [["shop"]],
      [["version"]],
      [["xyzzy"]],
      [["xyzzy", "--json"]],
      // Before 0.3 these scaffolded; a word is now always a command.
      [["my-app", "--no-install"]],
      [["--yes", "my-app"]],
      [["demo", "--yes"]],
      [["shop", "--template", "seller-express"]],
    ])("%j is left to oclif", (argv) => {
      const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      expect(normalizeArgv(argv, config, true)[0]).not.toBe("init");
      expect(stderr).not.toHaveBeenCalled();
      stderr.mockRestore();
    });
  });
});

describe("nearestCommand", () => {
  const commands = [
    "balance",
    "deposit",
    "dev",
    "status",
    "config",
    "config set",
    "config get",
    "withdrawals",
    "withdrawals request",
    "guarantees verify",
  ];

  it.each([
    [["statu"], "status"],
    // oclif hands over the arguments as part of the command.
    [["deposi", "100"], "deposit"],
    [["withdrawals", "reqest", "5"], "withdrawals request"],
    [["config", "sat", "network", "base"], "config set"],
    // A topic that is not itself a command.
    [["guarantees", "verfy", "receipt.json"], "guarantees verify"],
    // A real command that takes no argument, given one.
    [["balance", "now"], "balance"],
    // The start of a command is that command, not a slip of a shorter one:
    // `dep` is a letter from `dev`, and means `deposit`.
    [["dep"], "deposit"],
    [["dep", "5"], "deposit"],
    [["withdrawals", "req", "5"], "withdrawals request"],
    // Two letters could begin anything, so they are matched by distance.
    [["de"], "dev"],
  ])("%j is %s", (typed, expected) => {
    expect(nearestCommand(typed, commands)).toBe(expected);
  });

  it("names nothing for a word that is near no command", () => {
    expect(nearestCommand(["frobnicate", "100"], commands)).toBeUndefined();
  });
});

describe("distance", () => {
  it.each([
    ["status", "status", 0],
    ["statu", "status", 1],
    ["inti", "init", 1],
    ["dve", "dev", 1],
    ["demo", "dev", 2],
    ["web", "dev", 2],
    ["", "dev", 3],
    ["withdrawl", "withdrawals", 2],
  ])("%j to %j is %i", (a, b, expected) => {
    expect(distance(a, b)).toBe(expected);
    expect(distance(b, a)).toBe(expected);
  });
});
