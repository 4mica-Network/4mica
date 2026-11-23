import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { runCommand } from "../../test/run.js";
import WalletsCreate from "./create.js";
import WalletsImport from "./import.js";
import Wallets from "./index.js";
import WalletsRemove from "./remove.js";
import WalletsUse from "./use.js";

// One config directory for a whole test, so that commands see each other's
// work: `runCommand` otherwise starts each from an empty one.
let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "4mica-cli-"));
});

type Created = { name: string; address: string; path: string; active: boolean };
const run = async <T>(
  command: Parameters<typeof runCommand>[0],
  argv: string[],
) => (await runCommand(command, [...argv, "--json"], home)).json as T;

describe("wallets", () => {
  it("uses the first wallet, and a later one only when asked", async () => {
    const first = await run<Created>(WalletsCreate, []);
    expect(first).toMatchObject({ name: "default", active: true });

    const second = await run<Created>(WalletsCreate, ["buyer-1"]);
    expect(second.active).toBe(false);

    const list = await run<Created[]>(Wallets, []);
    expect(list.map((w) => [w.name, w.active])).toEqual([
      ["buyer-1", false],
      ["default", true],
    ]);

    await run(WalletsUse, ["buyer-1"]);
    const after = await run<Created[]>(Wallets, []);
    expect(after.find((w) => w.active)?.address).toBe(second.address);
  });

  it("never prints the key", async () => {
    const { stdout } = await runCommand(WalletsCreate, ["--json"], home);
    expect(stdout).not.toMatch(/0x[0-9a-f]{64}/);
  });

  it("says what a new wallet still needs", async () => {
    const created = await run<{ nextSteps: { step: string }[] }>(
      WalletsCreate,
      [],
    );
    expect(created.nextSteps.map((s) => s.step)).toEqual([
      "fund the wallet",
      "deposit collateral",
    ]);
  });

  it("refuses to switch to a wallet that does not exist", async () => {
    const { error } = await runCommand(WalletsUse, ["ghost"], home);
    expect(error).toMatchObject({ code: "WALLET_NOT_FOUND" });
  });

  it("imports a key from a file, leaving the file alone", async () => {
    // Hardhat's first test account: a key everyone knows, with a known address.
    const key =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const source = join(home, "seller.key");
    await writeFile(source, `${key}\n`, { mode: 0o600 });
    const imported = await run<Created>(WalletsImport, [
      "seller",
      "--key-file",
      source,
    ]);
    expect(imported).toMatchObject({
      name: "seller",
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      active: true,
    });
    expect((await readFile(source, "utf8")).trim()).toBe(key);
  });

  it("refuses to import something that is not a key", async () => {
    const source = join(home, "bad.key");
    await writeFile(source, "not a key", { mode: 0o600 });
    const { error } = await runCommand(
      WalletsImport,
      ["bad", "--key-file", source],
      home,
    );
    expect(error).toMatchObject({ code: "BAD_SIGNER" });
    expect(await run<Created[]>(Wallets, [])).toEqual([]);
  });

  describe("with a key file that holds no key", () => {
    const broken = () => join(home, "4mica", "wallets", "old.key");
    beforeEach(async () => {
      await run(WalletsCreate, ["buyer-1"]);
      await writeFile(broken(), "0xabc");
    });

    it("still lists the others, and marks the one it cannot use", async () => {
      const outcome = await runCommand(Wallets, ["--json"], home);
      expect(outcome.error).toBeUndefined();
      expect(outcome.json).toMatchObject([
        { name: "buyer-1", active: true, address: expect.any(String) },
        { name: "old", active: false, problem: "not a valid private key" },
      ]);
      const { stdout } = await runCommand(Wallets, [], home);
      expect(stdout).toContain("unusable: not a valid private key");
    });

    it("still switches between the others", async () => {
      await run(WalletsCreate, ["buyer-2"]);
      expect(await run(WalletsUse, ["buyer-2"])).toMatchObject({
        name: "buyer-2",
        active: true,
      });
    });

    it("will not switch to it", async () => {
      const { error } = await runCommand(WalletsUse, ["old"], home);
      expect(error).toMatchObject({ code: "BAD_SIGNER" });
      expect(error?.oclif?.exit).toBe(3);
      const list = await run<Created[]>(Wallets, []);
      expect(list.find((w) => w.active)?.name).toBe("buyer-1");
    });

    it("can delete it", async () => {
      const removed = await run<{ removed: boolean; wasActive: boolean }>(
        WalletsRemove,
        ["old", "--confirm", "old"],
      );
      expect(removed).toMatchObject({ removed: true, wasActive: false });
      expect((await run<Created[]>(Wallets, [])).map((w) => w.name)).toEqual([
        "buyer-1",
      ]);
    });
  });

  it("deletes a key only when its name is given twice", async () => {
    await run(WalletsCreate, ["doomed"]);
    for (const argv of [["doomed"], ["doomed", "--confirm", "other"]]) {
      const { error } = await runCommand(WalletsRemove, argv, home);
      expect(error?.oclif?.exit).toBe(2);
      expect(await run<Created[]>(Wallets, [])).toHaveLength(1);
    }
    const removed = await run<{ wasActive: boolean }>(WalletsRemove, [
      "doomed",
      "--confirm",
      "doomed",
    ]);
    // It was the wallet in use; the config no longer points at a missing file.
    expect(removed.wasActive).toBe(true);
    expect(await run<Created[]>(Wallets, [])).toEqual([]);
    expect((await runCommand(Wallets, ["--json"], home)).error).toBeUndefined();
  });
});
