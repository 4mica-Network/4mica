import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCommand } from "../../test/run.js";
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
    const shown = await runCommand(Config, ["--json"], dir);
    expect(JSON.stringify(shown.json)).not.toContain('"source":"config"');
    const wallets = await readdir(join(dir, "4mica", "wallets"));
    expect(wallets).toEqual(["keeper.key"]);
  });
});
