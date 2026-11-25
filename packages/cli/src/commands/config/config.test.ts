import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCommand } from "../../test/run.js";
import { pinJson } from "../../test/shape.js";
import WalletsCreate from "../wallets/create.js";
import Config from "./index.js";
import ConfigReset from "./reset.js";
import ConfigSet from "./set.js";
import ConfigUnset from "./unset.js";

const home = () => mkdtemp(join(tmpdir(), "4mica-cli-"));

describe("config unset", () => {
  it("says what it removed, and when there was nothing to remove", async () => {
    const dir = await home();
    await runCommand(ConfigSet, ["asset", "USDC"], dir);
    const first = await runCommand(ConfigUnset, ["asset", "--json"], dir);
    expect(first.json).toEqual({ key: "asset", removed: true });
    pinJson("config unset", first.json);
    expect(first.stderr).toContain("asset removed from");
    const second = await runCommand(ConfigUnset, ["asset", "--json"], dir);
    expect(second.json).toEqual({ key: "asset", removed: false });
    expect(second.stderr).toContain("asset was not set in");
  });
});

describe("config reset", () => {
  it("needs --yes where it cannot ask", async () => {
    const { error } = await runCommand(ConfigReset, []);
    expect(error).toMatchObject({ code: "CONFIRMATION_REQUIRED" });
  });

  it("drops every setting and keeps the wallet keys", async () => {
    const dir = await home();
    await runCommand(WalletsCreate, ["keeper"], dir);
    await runCommand(ConfigSet, ["asset", "USDC"], dir);
    const { json } = await runCommand(ConfigReset, ["--yes", "--json"], dir);
    expect(json).toEqual({
      removed: expect.arrayContaining(["asset", "key-file"]),
    });
    pinJson("config reset", json);
    const shown = await runCommand(Config, ["--json"], dir);
    expect(JSON.stringify(shown.json)).not.toContain('"source":"config"');
    const wallets = await readdir(join(dir, "4mica", "wallets"));
    expect(wallets).toEqual(["keeper.key"]);
  });
});

describe("config", () => {
  it("names each setting in camelCase with --json, and by its own name in the table", async () => {
    const dir = await home();
    const set = await runCommand(
      ConfigSet,
      ["rpc-url", "http://127.0.0.1:3000", "--json"],
      dir,
    );
    expect(set.json).toEqual({
      key: "rpc-url",
      value: "http://127.0.0.1:3000",
    });
    pinJson("config set", set.json);
    await runCommand(ConfigSet, ["asset", "USDC"], dir);

    const { stdout } = await runCommand(Config, [], dir);
    expect(stdout).toMatch(/rpc-url\s+http:\/\/127\.0\.0\.1:3000\s+config/);

    const { json } = await runCommand(Config, ["--json"], dir);
    expect(json).toMatchObject({
      settings: {
        rpcUrl: { value: "http://127.0.0.1:3000", source: "config" },
        asset: { value: "USDC", source: "config" },
      },
      walletKey: { set: false },
    });
    // No key with a hyphen: a script reads `.settings.rpcUrl.value`.
    expect(
      Object.keys((json as { settings: object }).settings).filter((key) =>
        key.includes("-"),
      ),
    ).toEqual([]);
    pinJson("config", json);
  });
});
