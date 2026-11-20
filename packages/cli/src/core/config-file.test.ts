import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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

  it.each([
    ["network", "nope"],
    ["rpc-url", "not a url"],
    ["facilitator-url", "ftp://example.com"],
    ["asset", "  "],
  ] as const)("refuses %s = %j as a usage error", (key, value) => {
    expect(() => withSetting({}, key, value)).toThrow(
      expect.objectContaining({ oclif: { exit: EXIT.usage } }),
    );
  });
});
