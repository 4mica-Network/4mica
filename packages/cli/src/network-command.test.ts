import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import Config from "./commands/config/index.js";
import ConfigSet from "./commands/config/set.js";
import Deposit from "./commands/deposit.js";
import Whoami from "./commands/whoami.js";
import { EXIT } from "./errors.js";
import { runCommand } from "./test/run.js";
import { pinJson } from "./test/shape.js";

// A throwaway key: 32 bytes of 0x11.
const KEY = `0x${"11".repeat(32)}`;

/** A config directory whose `key-file` points at a file that is gone. */
async function staleKeyFile(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "4mica-cli-"));
  const path = join(home, "gone.key");
  await writeFile(path, KEY, { mode: 0o600 });
  const set = await runCommand(ConfigSet, ["key-file", path], home);
  expect(set.error).toBeUndefined();
  await rm(path);
  return home;
}

describe("a key-file in the config that no longer exists", () => {
  it("does not stop a command that needs no wallet", async () => {
    const { error, json } = await runCommand(
      Config,
      ["--json"],
      await staleKeyFile(),
    );
    expect(error).toBeUndefined();
    expect(json).toMatchObject({ walletKey: { set: false } });
  });

  it("is the error once a wallet is needed", async () => {
    const { error } = await runCommand(Whoami, [], await staleKeyFile());
    expect(error).toMatchObject({
      code: "KEY_FILE_NOT_FOUND",
      oclif: { exit: EXIT.config },
    });
  });

  it("is not read when a key comes from a .env or --key-file", async () => {
    const home = await staleKeyFile();
    // `runCommand` makes `home` the working directory, so this is ./.env.
    await writeFile(join(home, ".env"), `FOURMICA_WALLET_PRIVATE_KEY=${KEY}\n`);
    const fromEnv = await runCommand(Whoami, ["--json"], home);
    expect(fromEnv.error).toBeUndefined();
    expect(fromEnv.json).toMatchObject({ key: { source: "env-file" } });

    const other = await staleKeyFile();
    const path = join(other, "wallet.key");
    await writeFile(path, KEY, { mode: 0o600 });
    const fromFlag = await runCommand(
      Whoami,
      ["--json", "--key-file", path],
      other,
    );
    expect(fromFlag.error).toBeUndefined();
    expect(fromFlag.json).toMatchObject({ key: { source: "flag" } });
    pinJson("whoami", fromFlag.json);
  });
});

describe("a .env found in someone else's project", () => {
  it("cannot point the config file's wallet at its own contract on mainnet", async () => {
    const home = await mkdtemp(join(tmpdir(), "4mica-cli-"));
    const key = join(home, "wallet.key");
    await writeFile(key, KEY, { mode: 0o600 });
    await runCommand(ConfigSet, ["key-file", key], home);
    await runCommand(ConfigSet, ["network", "base"], home);
    // `runCommand` makes `home` the working directory, so this is ./.env.
    await writeFile(
      join(home, ".env"),
      `FOURMICA_CONTRACT_ADDRESS=0x${"ad".repeat(20)}\n`,
    );
    // Stopped before connecting: nothing here reaches the network.
    const { error } = await runCommand(
      Deposit,
      ["100", "--asset", "USDC", "--dry-run"],
      home,
    );
    expect(error).toMatchObject({
      code: "ENDPOINT_NOT_CHOSEN",
      oclif: { exit: EXIT.config },
    });
    expect(error?.message).toContain("sets FOURMICA_CONTRACT_ADDRESS for base");
  });
});
