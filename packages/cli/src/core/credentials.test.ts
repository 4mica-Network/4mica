import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
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

const tokenAt = async (origin: string) => {
  const result = await loadToken(dir, origin, env);
  return result.status === "found" ? result.credential.token : undefined;
};
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
      status: "found",
      credential: { token: "4mica_cli_one", storage: "file", kind: "DEVICE" },
    });
    if (process.platform !== "win32") {
      expect((await stat(credentialsFile(dir, A))).mode & 0o777).toBe(0o600);
    }
  });

  it("files each platform's token separately", async () => {
    await saveToken(dir, A, "4mica_cli_one", { env });
    await saveToken(dir, B, "4mica_cli_two", { env });

    expect(await tokenAt(A)).toBe("4mica_cli_one");
    expect(await tokenAt(B)).toBe("4mica_cli_two");
    expect((await storedOrigins(dir)).sort()).toEqual([A, B].sort());

    expect(await removeToken(dir, A, env)).toBe(true);
    expect(await loadToken(dir, A, env)).toEqual({ status: "missing" });
    expect(await tokenAt(B)).toBe("4mica_cli_two");
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

    expect(await tokenAt(A)).toBe("4mica_cli_one");
    expect(await tokenAt(B)).toBe("4mica_cli_two");
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

  it("takes over a lock another machine stopped refreshing", async () => {
    await withCredentialLock(dir, A, async () => {});
    const lock = `${credentialsFile(dir, A)}.lock`;
    await writeFile(
      lock,
      JSON.stringify({ id: "old", pid: 1, host: "another-machine" }),
    );
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
    expect(await loadToken(dir, A, env)).toEqual({ status: "missing" });
  });

  it("reports a keychain it cannot reach, not a missing sign-in", async () => {
    await withCredentialLock(dir, A, async () => {});
    await writeFile(
      credentialsFile(dir, A),
      JSON.stringify({ origin: A, storage: "keychain", kind: "DEVICE" }),
    );

    expect(await loadToken(dir, A, env)).toMatchObject({
      status: "unavailable",
    });
  });

  it("takes over at once a lock whose owner has exited", async () => {
    await withCredentialLock(dir, A, async () => {});
    const lock = `${credentialsFile(dir, A)}.lock`;
    await writeFile(
      lock,
      JSON.stringify({ id: "gone", pid: 2 ** 22 + 7, host: hostname() }),
    );

    const started = Date.now();
    await expect(withCredentialLock(dir, A, async () => "ran")).resolves.toBe(
      "ran",
    );
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("waits for a lock whose owner is alive and recent", async () => {
    await withCredentialLock(dir, A, async () => {});
    const lock = `${credentialsFile(dir, A)}.lock`;
    await writeFile(
      lock,
      JSON.stringify({ id: "busy", pid: process.pid, host: hostname() }),
    );
    let ran = false;
    const waiting = withCredentialLock(dir, A, async () => {
      ran = true;
    });

    await sleep(300);
    expect(ran).toBe(false);
    await rm(lock);
    await waiting;
    expect(ran).toBe(true);
  });

  it("never takes a lock from a live process here, however long it is quiet", async () => {
    await withCredentialLock(dir, A, async () => {});
    const lock = `${credentialsFile(dir, A)}.lock`;
    await writeFile(
      lock,
      JSON.stringify({ id: "asleep", pid: process.pid, host: hostname() }),
    );
    const { utimes } = await import("node:fs/promises");
    const old = new Date(Date.now() - 10 * 60_000);
    await utimes(lock, old, old);
    let ran = false;
    const waiting = withCredentialLock(dir, A, async () => {
      ran = true;
    });

    await sleep(300);
    expect(ran).toBe(false);
    await rm(lock);
    await waiting;
    expect(ran).toBe(true);
  });

  it("tells a holder that lost its lock before it writes", async () => {
    const lock = `${credentialsFile(dir, A)}.lock`;
    await expect(
      withCredentialLock(dir, A, async (assertHeld) => {
        await assertHeld();
        await writeFile(
          lock,
          JSON.stringify({ id: "taken", pid: process.pid, host: hostname() }),
        );
        await assertHeld();
      }),
    ).rejects.toMatchObject({ code: "CREDENTIALS_LOCK_LOST" });
  });

  it("never removes a lock another process now holds", async () => {
    const lock = `${credentialsFile(dir, A)}.lock`;
    await withCredentialLock(dir, A, async () => {
      await writeFile(
        lock,
        JSON.stringify({
          id: "someone-else",
          pid: process.pid,
          host: hostname(),
        }),
      );
    });

    expect(JSON.parse(await readFile(lock, "utf8")).id).toBe("someone-else");
  });

  it("leaves nothing behind once the token is gone", async () => {
    await saveToken(dir, A, "4mica_cli_one", { env });
    await removeToken(dir, A, env);

    await expect(readFile(credentialsFile(dir, A))).rejects.toThrow();
    expect(await removeToken(dir, A, env)).toBe(false);
  });

  it("has nothing for a platform it never signed in to", async () => {
    expect(await loadToken(dir, A, env)).toEqual({ status: "missing" });
  });

  it("says which file is broken when it cannot be read", async () => {
    await saveToken(dir, A, "4mica_cli_one", { env });
    await writeFile(credentialsFile(dir, A), "{ not json");

    await expect(loadToken(dir, A, env)).rejects.toMatchObject({
      code: "BAD_CREDENTIALS_FILE",
    });
  });
});
