import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { beforeEach, describe, expect, it } from "vitest";
import {
  credentialsDir,
  credentialsFile,
  loadToken,
  removeToken,
  saveToken,
  storedOrigins,
  withCredentialLock,
} from "./credentials.js";

const env = { FOURMICA_CREDENTIAL_STORE: "file" };
const A = "https://api.app.4mica.io";
const B = "http://localhost:4000";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "4mica-cli-"));
});

describe("the token store", () => {
  it("keeps a token in a file only its owner can read", async () => {
    const kept = await saveToken(dir, A, "4mica_cli_one", {
      env,
      kind: "DEVICE",
    });

    expect(kept).toEqual({ storage: "file", where: credentialsFile(dir, A) });
    expect(await loadToken(dir, A, env)).toEqual({
      token: "4mica_cli_one",
      storage: "file",
      kind: "DEVICE",
    });
    if (process.platform !== "win32") {
      expect((await stat(credentialsFile(dir, A))).mode & 0o777).toBe(0o600);
    }
  });

  it("files each platform's token separately", async () => {
    await saveToken(dir, A, "4mica_cli_one", { env });
    await saveToken(dir, B, "4mica_cli_two", { env });

    expect((await loadToken(dir, A, env))?.token).toBe("4mica_cli_one");
    expect((await loadToken(dir, B, env))?.token).toBe("4mica_cli_two");
    expect((await storedOrigins(dir)).sort()).toEqual([A, B].sort());

    expect(await removeToken(dir, A, env)).toBe(true);
    expect(await loadToken(dir, A, env)).toBeUndefined();
    expect((await loadToken(dir, B, env))?.token).toBe("4mica_cli_two");
  });

  it("loses neither of two sign-ins to different platforms at once", async () => {
    await Promise.all([
      withCredentialLock(dir, A, () =>
        saveToken(dir, A, "4mica_cli_one", { env }),
      ),
      withCredentialLock(dir, B, () =>
        saveToken(dir, B, "4mica_cli_two", { env }),
      ),
    ]);

    expect((await loadToken(dir, A, env))?.token).toBe("4mica_cli_one");
    expect((await loadToken(dir, B, env))?.token).toBe("4mica_cli_two");
  });

  it("lets one change to a platform's sign-in run at a time", async () => {
    let inside = 0;
    let most = 0;
    const change = () =>
      withCredentialLock(dir, A, async () => {
        inside += 1;
        most = Math.max(most, inside);
        await sleep(20);
        inside -= 1;
      });

    await Promise.all([change(), change(), change()]);

    expect(most).toBe(1);
    expect(
      (await readdir(credentialsDir(dir))).filter((n) => n.endsWith(".lock")),
    ).toEqual([]);
  });

  it("takes over a lock left behind by a process that died", async () => {
    await withCredentialLock(dir, A, async () => {});
    const lock = `${credentialsFile(dir, A)}.lock`;
    await writeFile(lock, "");
    const { utimes } = await import("node:fs/promises");
    const old = new Date(Date.now() - 60_000);
    await utimes(lock, old, old);

    await expect(withCredentialLock(dir, A, async () => "ran")).resolves.toBe(
      "ran",
    );
  });

  it("refuses the file when the keychain is required", async () => {
    await expect(
      saveToken(dir, A, "4mica_cli_one", {
        fileOnly: true,
        env: { FOURMICA_CREDENTIAL_STORE: "keychain" },
      }),
    ).rejects.toMatchObject({ code: "KEYCHAIN_UNAVAILABLE" });
    expect(await loadToken(dir, A, env)).toBeUndefined();
  });

  it("moves a token kept by an earlier version into its own file", async () => {
    await writeFile(
      join(dir, "credentials.json"),
      JSON.stringify({ [B]: { storage: "file", token: "4mica_cli_old" } }),
    );

    expect((await loadToken(dir, B, env))?.token).toBe("4mica_cli_old");
    await expect(readFile(join(dir, "credentials.json"))).rejects.toThrow();
  });

  it("leaves nothing behind once the token is gone", async () => {
    await saveToken(dir, A, "4mica_cli_one", { env });
    await removeToken(dir, A, env);

    await expect(readFile(credentialsFile(dir, A))).rejects.toThrow();
    expect(await removeToken(dir, A, env)).toBe(false);
  });

  it("has nothing for a platform it never signed in to", async () => {
    expect(await loadToken(dir, A, env)).toBeUndefined();
  });

  it("says which file is broken when it cannot be read", async () => {
    await saveToken(dir, A, "4mica_cli_one", { env });
    await writeFile(credentialsFile(dir, A), "{ not json");

    await expect(loadToken(dir, A, env)).rejects.toMatchObject({
      code: "BAD_CREDENTIALS_FILE",
    });
  });
});
