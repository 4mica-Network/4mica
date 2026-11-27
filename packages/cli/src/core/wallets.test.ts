import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createWallet,
  findWallet,
  listWallets,
  walletPath,
} from "./wallets.js";

const tempDir = () => mkdtemp(join(tmpdir(), "4mica-cli-"));

describe("wallets", () => {
  it("writes a new key where only its owner can read it", async () => {
    const dir = await tempDir();
    const wallet = await createWallet(dir, "buyer-1");
    expect(wallet.path).toBe(walletPath(dir, "buyer-1"));
    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect((await readFile(wallet.path, "utf8")).trim()).toMatch(
      /^0x[0-9a-f]{64}$/,
    );
    if (process.platform !== "win32") {
      expect((await stat(wallet.path)).mode & 0o777).toBe(0o600);
    }
  });

  it("never overwrites a wallet: its key may hold funds", async () => {
    const dir = await tempDir();
    const first = await createWallet(dir, "default");
    const key = await readFile(first.path, "utf8");
    await expect(createWallet(dir, "default")).rejects.toMatchObject({
      code: "WALLET_EXISTS",
    });
    expect(await readFile(first.path, "utf8")).toBe(key);
  });

  it("makes a different key each time", async () => {
    const dir = await tempDir();
    const a = await createWallet(dir, "a");
    const b = await createWallet(dir, "b");
    expect(a.address).not.toBe(b.address);
  });

  it("lists what it created, by name, with the address each key gives", async () => {
    const dir = await tempDir();
    expect(await listWallets(dir)).toEqual([]);
    const b = await createWallet(dir, "b");
    const a = await createWallet(dir, "a");
    expect(await listWallets(dir)).toEqual([a, b]);
  });

  it("lists a key file it cannot use, next to the ones it can", async () => {
    const dir = await tempDir();
    const good = await createWallet(dir, "good");
    await writeFile(walletPath(dir, "old"), "0xabc");
    await writeFile(walletPath(dir, "notes"), "remember to rotate\n");
    // Reading a directory fails: a file the cli cannot read at all.
    await mkdir(walletPath(dir, "folder"));

    expect(await listWallets(dir)).toEqual([
      {
        name: "folder",
        path: walletPath(dir, "folder"),
        problem: "cannot be read (EISDIR)",
      },
      good,
      {
        name: "notes",
        path: walletPath(dir, "notes"),
        problem: "not a valid private key",
      },
      {
        name: "old",
        path: walletPath(dir, "old"),
        problem: "not a valid private key",
      },
    ]);
  });

  it("finds a wallet by name, usable or not", async () => {
    const dir = await tempDir();
    const good = await createWallet(dir, "good");
    await writeFile(walletPath(dir, "old"), "0xabc");
    expect(await findWallet(dir, "good")).toEqual(good);
    expect(await findWallet(dir, "old")).toMatchObject({
      problem: "not a valid private key",
    });
    await expect(findWallet(dir, "ghost")).rejects.toMatchObject({
      code: "WALLET_NOT_FOUND",
    });
  });

  it.each([
    "",
    "Has Space",
    "../escape",
    "-dash",
  ])("refuses the name %j", async (name) => {
    await expect(createWallet(await tempDir(), name)).rejects.toMatchObject({
      code: "BAD_WALLET_NAME",
    });
  });
});
