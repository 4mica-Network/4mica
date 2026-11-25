import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EXIT } from "../errors.js";
import {
  configPath,
  readConfig,
  withSetting,
  writeConfig,
} from "./config-file.js";

const tempDir = () => mkdtemp(join(tmpdir(), "4mica-cli-"));

describe("config file", () => {
  it("is empty when the file does not exist", async () => {
    expect(await readConfig(await tempDir())).toEqual({});
  });

  it("round-trips, creating the directory", async () => {
    const dir = join(await tempDir(), "nested");
    await writeConfig(dir, { network: "base", asset: "USDC" });
    expect(await readConfig(dir)).toEqual({ network: "base", asset: "USDC" });
  });

  it("reports a file that is not JSON as a config error naming it", async () => {
    const dir = await tempDir();
    await writeFile(configPath(dir), "{ nope");
    await expect(readConfig(dir)).rejects.toMatchObject({
      code: "BAD_CONFIG_FILE",
      oclif: { exit: EXIT.config },
    });
  });

  it("ignores keys it does not know, such as a wallet key someone added", async () => {
    const dir = await tempDir();
    await writeFile(
      configPath(dir),
      JSON.stringify({ network: "base", "wallet-key": "0xabc" }),
    );
    expect(await readConfig(dir)).toEqual({ network: "base" });
  });

  it("keeps keys a newer version wrote when it rewrites the file", async () => {
    const dir = await tempDir();
    await writeFile(
      configPath(dir),
      JSON.stringify({ asset: "USDC", future: "x" }),
    );
    await writeConfig(
      dir,
      withSetting(await readConfig(dir), "network", "base-sepolia"),
    );
    expect(JSON.parse(await readFile(configPath(dir), "utf8"))).toEqual({
      asset: "USDC",
      future: "x",
      network: "base-sepolia",
    });
  });

  it("drops everything on a reset", async () => {
    const dir = await tempDir();
    await writeFile(
      configPath(dir),
      JSON.stringify({ asset: "USDC", future: "x" }),
    );
    await writeConfig(dir, {}, { reset: true });
    expect(JSON.parse(await readFile(configPath(dir), "utf8"))).toEqual({});
  });

  it("is readable by its owner only, and leaves no temporary file", async () => {
    const dir = await tempDir();
    await writeFile(configPath(dir), "{}", { mode: 0o644 });
    await writeConfig(dir, { asset: "USDC" });
    if (process.platform !== "win32") {
      expect((await stat(configPath(dir))).mode & 0o777).toBe(0o600);
    }
    expect(await readdir(dir)).toEqual(["config.json"]);
  });

  it("leaves the old file whole when a write fails", async () => {
    const dir = await tempDir();
    await writeConfig(dir, { asset: "USDC" });
    // A value JSON cannot hold fails the write half-way.
    await expect(
      writeConfig(dir, { asset: 1n as unknown as string }),
    ).rejects.toThrow();
    expect(await readConfig(dir)).toEqual({ asset: "USDC" });
    expect(await readdir(dir)).toEqual(["config.json"]);
  });
});

describe("withSetting", () => {
  it("stores a network by its shorthand", () => {
    expect(withSetting({}, "network", "eip155:84532")).toEqual({
      network: "base-sepolia",
    });
  });

  it("drops rpc-url when a network is set, and the reverse", () => {
    expect(
      withSetting({ "rpc-url": "http://localhost:3000" }, "network", "base"),
    ).toEqual({ network: "base" });
    expect(
      withSetting({ network: "base" }, "rpc-url", "http://localhost:3000"),
    ).toEqual({ "rpc-url": "http://localhost:3000" });
  });

  it("stores a key file by its absolute path, and only if it exists", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "key"), "0xabc");
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    expect(withSetting({}, "key-file", "key")).toEqual({
      "key-file": join(dir, "key"),
    });
    expect(() => withSetting({}, "key-file", "missing")).toThrow(
      expect.objectContaining({ code: "KEY_FILE_NOT_FOUND" }),
    );
    // A directory exists, and holds no key.
    expect(() => withSetting({}, "key-file", ".")).toThrow(
      expect.objectContaining({
        code: "KEY_FILE_UNREADABLE",
        oclif: { exit: EXIT.usage },
      }),
    );
    cwd.mockRestore();
  });

  it.each([
    ["network", "nope"],
    ["rpc-url", "not a url"],
    ["facilitator-url", "ftp://example.com"],
    ["rpc-url", "http://core.example.com"],
    ["asset", "  "],
  ] as const)("refuses %s = %j as a usage error", (key, value) => {
    expect(() => withSetting({}, key, value)).toThrow(
      expect.objectContaining({ oclif: { exit: EXIT.usage } }),
    );
  });
});
