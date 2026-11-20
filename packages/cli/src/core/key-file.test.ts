import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "../errors.js";
import { readKeyFile } from "./key-file.js";

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

  it("refuses an empty file", async () => {
    await expect(
      readKeyFile(await keyFile("  \n"), "flag"),
    ).rejects.toMatchObject({ code: "BAD_SIGNER" });
  });
});
