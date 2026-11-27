import { describe, expect, it, vi } from "vitest";
import { BaseCommand } from "./base.js";
import { runCommand } from "./test/run.js";

class Broken extends BaseCommand {
  static id = "broken";
  async run(): Promise<void> {
    await this.parse(Broken);
    throw new TypeError("Cannot read properties of undefined (reading 'x')");
  }
}

describe("an error nothing recognised", () => {
  it("is reported as a bug, with a link that carries no argv", async () => {
    const { error } = await runCommand(Broken, []);
    expect(error).toMatchObject({ code: "UNEXPECTED", oclif: { exit: 1 } });
    expect(error?.message).toBe(
      "TypeError: Cannot read properties of undefined (reading 'x')",
    );
    const link = error?.suggestions?.find((s) => s.includes("issues/new"));
    expect(link).toBeDefined();
    expect(decodeURIComponent(link as string)).toContain("command: broken");
    expect(error?.suggestions).toContain(
      "rerun with --debug to see where it failed",
    );
  });

  it("prints its stack with --debug", async () => {
    const { stderr } = await runCommand(Broken, ["--debug"]);
    expect(stderr).toContain("[debug] TypeError: Cannot read properties");
    expect(stderr).toContain("base.test.ts");
  });
});

describe("Ctrl-C", () => {
  const interrupt = async (json: boolean) => {
    const { onInterrupt } = await import("./base.js");
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    onInterrupt(json);
    const said = {
      code: exit.mock.calls[0]?.[0],
      stderr: stderr.mock.calls.map(([c]) => String(c)).join(""),
      stdout: stdout.mock.calls.map(([c]) => String(c)).join(""),
    };
    exit.mockRestore();
    stderr.mockRestore();
    stdout.mockRestore();
    return said;
  };

  it("says nothing was sent when nothing was", async () => {
    const { resetOutcome } = await import("./core/outcome.js");
    resetOutcome();
    const said = await interrupt(false);
    expect(said.code).toBe(130);
    expect(said.stderr.trim()).toBe("cancelled; nothing was sent");
  });

  it("names the transaction that already left, and where to check", async () => {
    const { beginSending, recordTransaction, resetOutcome, setExplorer } =
      await import("./core/outcome.js");
    resetOutcome();
    setExplorer("https://sepolia.basescan.org");
    beginSending("the deposit of 5 USDC", ["4mica balance"]);
    recordTransaction(`0x${"cd".repeat(32)}`);
    const said = await interrupt(true);
    expect(said.code).toBe(130);
    expect(said.stderr).toContain(
      `interrupted: the deposit of 5 USDC was sent as https://sepolia.basescan.org/tx/0x${"cd".repeat(32)}`,
    );
    expect(said.stderr).toContain("`4mica balance`");
    expect(JSON.parse(said.stdout)).toMatchObject({
      error: { code: "OUTCOME_UNKNOWN", retryable: false },
    });
    resetOutcome();
  });
});
