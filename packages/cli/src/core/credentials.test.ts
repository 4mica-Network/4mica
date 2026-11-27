import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  credentialsPath,
  loadToken,
  removeToken,
  saveToken,
} from "./credentials.js";

// The file store only: the keychain is the developer's own, and these tests
// must not write to it.
const env = { FOURMICA_CREDENTIAL_STORE: "file" };
const A = "https://api.app.4mica.io";
const B = "http://localhost:4000";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "4mica-cli-"));
});

describe("the token store", () => {
  it("keeps a token in a file only its owner can read", async () => {
    const kept = await saveToken(dir, A, "4mica_cli_one", { env });

    expect(kept).toEqual({ storage: "file", where: credentialsPath(dir) });
    expect(await loadToken(dir, A, env)).toEqual({
      token: "4mica_cli_one",
      storage: "file",
    });
    if (process.platform !== "win32") {
      expect((await stat(credentialsPath(dir))).mode & 0o777).toBe(0o600);
    }
  });

  it("files each platform's token separately", async () => {
    await saveToken(dir, A, "4mica_cli_one", { env });
    await saveToken(dir, B, "4mica_cli_two", { env });

    expect((await loadToken(dir, A, env))?.token).toBe("4mica_cli_one");
    expect((await loadToken(dir, B, env))?.token).toBe("4mica_cli_two");

    expect(await removeToken(dir, A, env)).toBe(true);
    expect(await loadToken(dir, A, env)).toBeUndefined();
    expect((await loadToken(dir, B, env))?.token).toBe("4mica_cli_two");
  });

  it("leaves no file behind once the last token is gone", async () => {
    await saveToken(dir, A, "4mica_cli_one", { env });
    await removeToken(dir, A, env);

    await expect(readFile(credentialsPath(dir))).rejects.toThrow();
    expect(await removeToken(dir, A, env)).toBe(false);
  });

  it("has nothing for a platform it never signed in to", async () => {
    expect(await loadToken(dir, A, env)).toBeUndefined();
  });

  it("says which file is broken when it cannot be read", async () => {
    await writeFile(credentialsPath(dir), "{ not json");

    await expect(loadToken(dir, A, env)).rejects.toMatchObject({
      code: "BAD_CREDENTIALS_FILE",
    });
  });
});
