import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "../errors.js";
import { readKeyFile } from "./key-file.js";

// What the prompt library would answer; a symbol stands for Ctrl-C.
const CANCEL = Symbol("cancel");
const typed = vi.fn<(options: { message: string }) => Promise<unknown>>();
vi.mock("@clack/prompts", () => ({
  password: (options: { message: string }) => typed(options),
  isCancel: (value: unknown) => value === CANCEL,
}));

/** Runs `fn` as if stdin and stderr were, or were not, a terminal. */
async function atTerminal<T>(fn: () => Promise<T>): Promise<T> {
  const streams = [process.stdin, process.stderr] as const;
  const before = streams.map((stream) => stream.isTTY);
  for (const stream of streams) {
    Object.defineProperty(stream, "isTTY", { value: true, configurable: true });
  }
  try {
    return await fn();
  } finally {
    streams.forEach((stream, i) => {
      Object.defineProperty(stream, "isTTY", {
        value: before[i],
        configurable: true,
      });
    });
  }
}

const keyFile = async (content: string, mode = 0o600) => {
  const path = join(await mkdtemp(join(tmpdir(), "4mica-cli-")), "key");
  await writeFile(path, content);
  await chmod(path, mode);
  return path;
};

afterEach(() => vi.restoreAllMocks());

describe("readKeyFile", () => {
  it("returns the key without its trailing newline", async () => {
    const path = await keyFile("0xabc\n");
    expect(await readKeyFile(path, "flag")).toEqual({
      path,
      source: "flag",
      key: "0xabc",
    });
  });

  it.runIf(process.platform !== "win32")(
    "warns, without printing the key, when others can read the file",
    async () => {
      const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      const path = await keyFile("0xsecret", 0o644);
      await readKeyFile(path, "flag");
      const written = stderr.mock.calls.join("");
      expect(written).toContain("chmod 600");
      expect(written).not.toContain("0xsecret");
    },
  );

  it("calls a missing file a usage error from the flag, a config error from the config file", async () => {
    await expect(readKeyFile("/nope/key", "flag")).rejects.toMatchObject({
      code: "KEY_FILE_NOT_FOUND",
      oclif: { exit: EXIT.usage },
    });
    await expect(readKeyFile("/nope/key", "config")).rejects.toMatchObject({
      oclif: { exit: EXIT.config },
    });
  });

  it("says what is wrong with a directory, as the same kind of error", async () => {
    const dir = await mkdtemp(join(tmpdir(), "4mica-cli-"));
    await expect(readKeyFile(dir, "flag")).rejects.toMatchObject({
      code: "KEY_FILE_UNREADABLE",
      message: `${dir} is a directory, not a key file`,
      oclif: { exit: EXIT.usage },
    });
    await expect(readKeyFile(dir, "config")).rejects.toMatchObject({
      code: "KEY_FILE_UNREADABLE",
      oclif: { exit: EXIT.config },
    });
  });

  it("refuses an empty file", async () => {
    await expect(
      readKeyFile(await keyFile("  \n"), "flag"),
    ).rejects.toMatchObject({ code: "BAD_SIGNER" });
  });
});

describe("readKeyFile, beyond the file itself", () => {
  it("still warns about a key others can read with --quiet", async () => {
    const { setRuntimeFlags } = await import("./runtime.js");
    setRuntimeFlags({ quiet: true });
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const path = await keyFile("0xabc", 0o644);
    await readKeyFile(path, "flag");
    setRuntimeFlags({});
    if (process.platform !== "win32") {
      expect(stderr).toHaveBeenCalledWith(
        expect.stringContaining("readable by other users"),
      );
    }
  });

  it("does not wait on a terminal for a key with --no-input", async () => {
    const { setRuntimeFlags } = await import("./runtime.js");
    setRuntimeFlags({ "no-input": true });
    const was = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });
    await expect(readKeyFile("-", "flag")).rejects.toMatchObject({
      code: "STDIN_REQUIRED",
      oclif: { exit: EXIT.usage },
    });
    Object.defineProperty(process.stdin, "isTTY", {
      value: was,
      configurable: true,
    });
    setRuntimeFlags({});
  });

  it("asks for a typed key through a masked prompt, never an echoing one", async () => {
    typed.mockResolvedValueOnce(` 0x${"11".repeat(32)}\n`);
    const read = await atTerminal(() => readKeyFile("-", "flag"));
    expect(read).toMatchObject({ key: `0x${"11".repeat(32)}` });
    expect(typed).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Wallet key",
        output: process.stderr,
      }),
    );
  });

  it("is a cancel, exit 130, when the prompt is left with Ctrl-C", async () => {
    typed.mockResolvedValueOnce(CANCEL);
    await expect(
      atTerminal(() => readKeyFile("-", "flag")),
    ).rejects.toMatchObject({
      code: "CANCELLED",
      message: "cancelled; no key was read",
      oclif: { exit: EXIT.cancelled },
    });
  });
});
