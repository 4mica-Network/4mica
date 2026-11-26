import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "../errors.js";
import { confirmFunds } from "./confirm.js";
import type { Preview } from "./preview.js";
import { setRuntimeFlags } from "./runtime.js";
import { resolveSettings } from "./settings.js";

const question = vi.fn();
vi.mock("node:readline/promises", () => ({
  createInterface: () => ({ question, on: vi.fn(), close: vi.fn() }),
}));

const tty = (value: boolean) => {
  for (const stream of [process.stdin, process.stderr]) {
    Object.defineProperty(stream, "isTTY", { value, configurable: true });
  }
};
const before = [process.stdin.isTTY, process.stderr.isTTY] as const;
let stderr: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  tty(true);
  setRuntimeFlags({});
  stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
});
afterEach(() => {
  Object.defineProperty(process.stdin, "isTTY", {
    value: before[0],
    configurable: true,
  });
  Object.defineProperty(process.stderr, "isTTY", {
    value: before[1],
    configurable: true,
  });
  stderr.mockRestore();
  vi.clearAllMocks();
});

const on = (flags: { network?: string; "rpc-url"?: string }) =>
  resolveSettings({ flags, env: {}, config: {} });
const summary = { action: "Deposit 5 USDC", address: "0xWallet" };
const no = { yes: false };

describe("confirmFunds", () => {
  it("takes y on a testnet", async () => {
    question.mockResolvedValue("y");
    await expect(confirmFunds(summary, on({}), no)).resolves.toBeUndefined();
    expect(question.mock.calls[0][0]).toBe("Send it? [y/N] ");
  });

  it("wants the network's name typed on a mainnet; y is not enough", async () => {
    question.mockResolvedValue("y");
    await expect(
      confirmFunds(summary, on({ network: "base" }), no),
    ).rejects.toMatchObject({
      code: "CANCELLED",
      oclif: { exit: EXIT.cancelled },
    });
    expect(question.mock.calls[0][0]).toBe("Type base to send it: ");
    question.mockResolvedValue("base");
    await expect(
      confirmFunds(summary, on({ network: "base" }), no),
    ).resolves.toBeUndefined();
  });

  it("treats a core given by url as real funds, and asks for its host", async () => {
    question.mockResolvedValue("y");
    const remote = on({ "rpc-url": "https://core.example" });
    await expect(confirmFunds(summary, remote, no)).rejects.toMatchObject({
      code: "CANCELLED",
    });
    expect(question.mock.calls[0][0]).toBe("Type core.example to send it: ");
    const written = stderr.mock.calls
      .map(([c]: unknown[]) => String(c))
      .join("");
    expect(written).toContain("not a known testnet: may be real funds");
  });

  it("makes Ctrl-C at the question a cancel, not a crash", async () => {
    question.mockRejectedValue(
      Object.assign(new Error("Aborted with Ctrl+C"), { name: "AbortError" }),
    );
    await expect(confirmFunds(summary, on({}), no)).rejects.toMatchObject({
      code: "CANCELLED",
      oclif: { exit: EXIT.cancelled },
    });
  });

  it("asks nothing, and sends nothing, for a preview that found a problem", async () => {
    const preview: Preview = {
      dryRun: true,
      action: "deposit 5 USDC",
      network: "base-sepolia",
      wallet: "0xWallet",
      details: {},
      problems: ["the wallet holds 1 USDC; this needs 5"],
      ready: false,
    };
    await expect(
      confirmFunds(preview, on({}), { yes: true }),
    ).rejects.toMatchObject({
      code: "NOT_READY",
    });
    expect(question).not.toHaveBeenCalled();
  });

  it("never asks where nobody can answer", async () => {
    tty(false);
    await expect(confirmFunds(summary, on({}), no)).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
      oclif: { exit: EXIT.usage },
    });
    expect(question).not.toHaveBeenCalled();
  });
});
