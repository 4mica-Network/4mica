import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { credentialsFile } from "../../core/credentials.js";
import {
  ACCOUNT,
  GRANTED,
  linkMessage,
  type MockPlatform,
  mockPlatform,
} from "../../test/platform.js";
import { runCommand } from "../../test/run.js";
import { pinJson } from "../../test/shape.js";
import Account from "../account.js";
import WalletsCreate from "../wallets/create.js";
import WalletsLink from "../wallets/link.js";
import WalletsUnlink from "../wallets/unlink.js";
import AuthLogin from "./login.js";
import AuthLogout from "./logout.js";
import AuthStatus from "./status.js";

const { openBrowser, readInput } = vi.hoisted(() => ({
  openBrowser: vi.fn(async () => {}),
  readInput: vi.fn(async () => ""),
}));

vi.mock("../../core/runner.js", () => ({ openBrowser }));
vi.mock("../../core/input.js", () => ({ readInput }));

vi.setConfig({ testTimeout: 30_000 });

let home: string;
let platform: MockPlatform;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "4mica-cli-"));
  platform = await mockPlatform();
  openBrowser.mockClear();
  readInput.mockReset();
});

afterEach(async () => {
  await platform.close();
});

const run = (
  command: Parameters<typeof runCommand>[0],
  argv: string[] = [],
  env: Record<string, string> = {},
) =>
  runCommand(command, argv, home, { FOURMICA_API_URL: platform.url, ...env });

const configDir = () => join(home, "4mica");

const tokenFile = () =>
  credentialsFile(configDir(), new URL(platform.url).origin);

const signIn = () => run(AuthLogin, ["--json", "--name", "ada-laptop"]);

describe("auth login", () => {
  it("shows a code, waits for approval, and keeps the token it is given", async () => {
    platform.polls.push("authorization_pending");
    const { json, stderr, stdout, error } = await signIn();

    expect(error).toBeUndefined();
    expect(stderr).toContain("BCDF-GHJK");
    expect(stderr).toContain("http://app.test/cli/authorize?code=BCDF-GHJK");
    expect(openBrowser).toHaveBeenCalledWith(
      "http://app.test/cli/authorize?code=BCDF-GHJK",
    );
    expect(platform.clientName).toBe("ada-laptop");
    expect(json).toMatchObject({ account: ACCOUNT, storage: "file" });
    pinJson("auth login", json);

    const file = tokenFile();
    expect(await readFile(file, "utf8")).toContain(GRANTED);
    if (process.platform !== "win32") {
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    }
    expect(stdout + stderr).not.toContain(GRANTED);
  });

  it("does not open a browser when told not to", async () => {
    const { stderr } = await run(AuthLogin, ["--no-open"]);

    expect(openBrowser).not.toHaveBeenCalled();
    expect(stderr).toContain("http://app.test/cli/authorize?code=BCDF-GHJK");
  });

  it("stops when the sign-in is denied", async () => {
    platform.polls.push("access_denied");
    const { error } = await run(AuthLogin);

    expect(error).toMatchObject({ code: "ACCESS_DENIED" });
    await expect(readFile(tokenFile())).rejects.toThrow();
  });

  it("says so when the code expires unapproved", async () => {
    platform.polls.push("expired_token");
    const { error } = await run(AuthLogin);

    expect(error).toMatchObject({ code: "LOGIN_EXPIRED" });
  });

  it("takes a token on stdin, and checks it before keeping it", async () => {
    platform.tokens.add("4mica_cli_made-in-the-dashboard");
    readInput.mockResolvedValue("4mica_cli_made-in-the-dashboard\n");
    const { json } = await run(AuthLogin, ["--with-token", "--json"]);

    expect(readInput).toHaveBeenCalledWith("-");
    expect(json).toMatchObject({ account: ACCOUNT });
    expect(platform.requests.map((r) => r.url)).toEqual(["/v1/cli/session"]);

    readInput.mockResolvedValue("4mica_cli_revoked-long-ago");
    const refused = await run(AuthLogin, ["--with-token"]);
    expect(refused.error).toMatchObject({ code: "SESSION_INVALID" });
    expect(await readFile(tokenFile(), "utf8")).toContain(
      "made-in-the-dashboard",
    );
  });

  it("refuses something that is not a token without sending it anywhere", async () => {
    readInput.mockResolvedValue("0xac0974bec39a17e36ba4a6b4d238ff94");
    const { error } = await run(AuthLogin, ["--with-token"]);

    expect(error).toMatchObject({ code: "BAD_TOKEN" });
    expect(platform.requests).toEqual([]);
  });

  it("revokes a browser session it replaces", async () => {
    platform.tokens.add("4mica_cli_older");
    platform.kinds.set("4mica_cli_older", "DEVICE");
    readInput.mockResolvedValue("4mica_cli_older");
    await run(AuthLogin, ["--with-token"]);

    await signIn();

    expect(platform.tokens.has("4mica_cli_older")).toBe(false);
    expect(platform.tokens.has(GRANTED)).toBe(true);
  });

  it("leaves a dashboard token it replaces valid, since CI may share it", async () => {
    platform.tokens.add("4mica_cli_shared");
    readInput.mockResolvedValue("4mica_cli_shared");
    await run(AuthLogin, ["--with-token"]);

    const { stderr } = await signIn();

    expect(platform.tokens.has("4mica_cli_shared")).toBe(true);
    expect(stderr).toContain("still valid");
  });

  it("asks only for the permissions named", async () => {
    await run(AuthLogin, ["--scopes", "account:read,wallets:unlink"]);

    expect(platform.scope).toBe("account:read wallets:unlink");
  });

  it("rides out a platform that is briefly down or busy", async () => {
    platform.polls.push("503", "429");
    const { error, stderr } = await signIn();

    expect(error).toBeUndefined();
    expect(stderr).toContain("retrying");
    expect(platform.tokens.has(GRANTED)).toBe(true);
  });

  it("rides out a dropped connection", async () => {
    platform.polls.push("drop");
    const { error } = await signIn();

    expect(error).toBeUndefined();
  });

  it("says so when the token was issued but its answer was lost", async () => {
    platform.polls.push("grant-then-drop");
    const { error } = await run(AuthLogin);

    expect(error).toMatchObject({ code: "LOGIN_RESPONSE_LOST" });
    expect(error?.suggestions?.[0]).toContain("CLI sessions");
  });

  it("will not send a token to a platform over plain http", async () => {
    const { error } = await run(AuthLogin, [], {
      FOURMICA_API_URL: "http://platform.example",
    });

    expect(error).toMatchObject({ code: "BAD_API_URL" });
    expect(platform.requests).toEqual([]);
  });
});

describe("auth status", () => {
  it("says there is no session when there is none", async () => {
    const { error } = await run(AuthStatus);

    expect(error).toMatchObject({ code: "NOT_LOGGED_IN" });
    expect(error?.oclif?.exit).toBe(3);
    expect(platform.requests).toEqual([]);
  });

  it("names the account, and never the token", async () => {
    await signIn();
    const { json, stdout } = await run(AuthStatus, ["--json"]);

    expect(json).toMatchObject({ account: ACCOUNT, tokenSource: "file" });
    expect(stdout).not.toContain(GRANTED);
    pinJson("auth status", json);
  });

  it("uses FOURMICA_TOKEN ahead of a stored session", async () => {
    await signIn();
    platform.tokens.add("4mica_cli_for-ci");
    const { json } = await run(AuthStatus, ["--json"], {
      FOURMICA_TOKEN: "4mica_cli_for-ci",
    });

    expect(json).toMatchObject({ tokenSource: "env" });
    expect(platform.bearers.at(-1)).toBe("4mica_cli_for-ci");
  });

  it("reports a session revoked elsewhere as invalid", async () => {
    await signIn();
    platform.tokens.clear();
    const { error } = await run(AuthStatus);

    expect(error).toMatchObject({ code: "SESSION_INVALID" });
  });

  it("keeps one platform's token away from another", async () => {
    await signIn();
    const other = await mockPlatform();
    try {
      const { error } = await run(AuthStatus, [], {
        FOURMICA_API_URL: other.url,
      });

      expect(error).toMatchObject({ code: "NOT_LOGGED_IN" });
      expect(error?.message).toContain(other.url);
      expect(error?.suggestions?.[0]).toContain(
        `FOURMICA_API_URL=${platform.url}`,
      );
      expect(other.requests).toEqual([]);
    } finally {
      await other.close();
    }
  });
});

describe("auth logout", () => {
  it("revokes the token on the platform and forgets it here", async () => {
    await signIn();
    const { json } = await run(AuthLogout, ["--json"]);

    expect(json).toMatchObject({ loggedOut: true, revoked: true });
    expect(platform.tokens.has(GRANTED)).toBe(false);
    await expect(readFile(tokenFile())).rejects.toThrow();
    pinJson("auth logout", json);
  });

  it("leaves a dashboard token valid unless told to revoke it", async () => {
    platform.tokens.add("4mica_cli_shared");
    readInput.mockResolvedValue("4mica_cli_shared");
    await run(AuthLogin, ["--with-token"]);

    const kept = await run(AuthLogout, ["--json"]);
    expect(kept.json).toMatchObject({ loggedOut: true, revoked: false });
    expect(kept.stderr).toContain("--revoke");
    expect(platform.tokens.has("4mica_cli_shared")).toBe(true);

    await run(AuthLogin, ["--with-token"]);
    const revoked = await run(AuthLogout, ["--revoke", "--json"]);
    expect(revoked.json).toMatchObject({ loggedOut: true, revoked: true });
    expect(platform.tokens.has("4mica_cli_shared")).toBe(false);
  });

  it("forgets the token even when the platform cannot be reached", async () => {
    await signIn();
    await platform.close();
    const { json, stderr } = await run(AuthLogout, ["--json"]);

    expect(json).toMatchObject({ loggedOut: true, revoked: false });
    expect(stderr).toContain("revoke it in the dashboard");
    await expect(readFile(tokenFile())).rejects.toThrow();
  });

  it("leaves FOURMICA_TOKEN alone, and says it is still in effect", async () => {
    platform.tokens.add("4mica_cli_for-ci");
    const { json, stderr } = await run(AuthLogout, ["--json"], {
      FOURMICA_TOKEN: "4mica_cli_for-ci",
    });

    expect(json).toMatchObject({ loggedOut: false });
    expect(platform.tokens.has("4mica_cli_for-ci")).toBe(true);
    expect(stderr).toContain("FOURMICA_TOKEN is still set");
  });
});

describe("account", () => {
  it("needs a session", async () => {
    const { error } = await run(Account);

    expect(error).toMatchObject({ code: "NOT_LOGGED_IN" });
  });

  it("shows the account and its linked wallets", async () => {
    await signIn();
    await run(WalletsCreate, ["buyer-1"]);
    await run(WalletsLink, []);
    const { json } = await run(Account, ["--json"]);

    expect(json).toMatchObject({
      account: ACCOUNT,
      wallets: [{ label: "buyer-1", network: "BASE_SEPOLIA" }],
    });
    pinJson("account", json);
  });

  it("lists every linked wallet, past the first page", async () => {
    await signIn();
    for (let i = 0; i < 150; i += 1) {
      platform.wallets.push({
        id: `wallet-${i}`,
        label: `w${i}`,
        address: `0x${i.toString(16).padStart(40, "0")}`,
        network: "BASE_SEPOLIA",
        status: "ACTIVE",
      } as (typeof platform.wallets)[number]);
    }
    const { json, error } = await run(Account, ["--json"]);

    expect(error).toBeUndefined();
    expect((json as { wallets: unknown[] }).wallets).toHaveLength(150);
  });
});

describe("wallets link", () => {
  type Created = { address: string };
  const create = async (name: string) =>
    (await run(WalletsCreate, [name, "--json"])).json as Created;

  it("proves the wallet to the platform by signing its challenge", async () => {
    await signIn();
    const { address } = await create("buyer-1");
    const { json, stdout, stderr } = await run(WalletsLink, ["--json"]);

    expect(platform.wallets).toEqual([
      expect.objectContaining({
        address: address.toLowerCase(),
        label: "buyer-1",
        network: "BASE_SEPOLIA",
      }),
    ]);
    expect(stdout + stderr).not.toMatch(/0x[0-9a-f]{64}\b/);
    pinJson("wallets link", json);
  });

  it("needs an account session, and says how to get one", async () => {
    await create("buyer-1");
    const { error } = await run(WalletsLink);

    expect(error).toMatchObject({ code: "NOT_LOGGED_IN" });
    expect(platform.requests).toEqual([]);
  });

  it("signs nothing but a wallet-link challenge for its own address", async () => {
    await signIn();
    await create("buyer-1");

    for (const challenge of [
      "Transfer all funds to 0x000000000000000000000000000000000000dEaD",
      linkMessage("0x000000000000000000000000000000000000dEaD"),
      linkMessage("ADDRESS").replace("wallet-link", "session-login"),
    ]) {
      platform.challenge = challenge;
      const { error } = await run(WalletsLink);
      expect(error).toMatchObject({ code: "UNEXPECTED_CHALLENGE" });
    }
    expect(platform.wallets).toEqual([]);
    expect(platform.requests.map((r) => r.url)).not.toContain("/me/wallets");
  });

  it("refuses a challenge for another chain", async () => {
    await signIn();
    const { address } = await create("buyer-1");
    platform.challenge = linkMessage(address, { chainId: 1 });
    const { error } = await run(WalletsLink);

    expect(error).toMatchObject({ code: "UNEXPECTED_CHALLENGE" });
  });

  it("says so when the wallet is already linked", async () => {
    await signIn();
    await create("buyer-1");
    await run(WalletsLink);
    const { error } = await run(WalletsLink);

    expect(error).toMatchObject({ code: "WALLET_ALREADY_LINKED" });
  });

  it("cannot link on a core that is not a hosted network", async () => {
    await signIn();
    await create("buyer-1");
    const { error } = await run(WalletsLink, [
      "--rpc-url",
      "http://localhost:1",
    ]);

    expect(error).toMatchObject({ code: "NETWORK_REQUIRED" });
  });
});

describe("wallets unlink", () => {
  it("asks before removing, and removes with --yes", async () => {
    await signIn();
    await run(WalletsCreate, ["buyer-1"]);
    await run(WalletsLink);

    const unasked = await run(WalletsUnlink);
    expect(unasked.error).toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    expect(platform.wallets).toHaveLength(1);

    const { json } = await run(WalletsUnlink, ["--yes", "--json"]);
    expect(json).toMatchObject({ unlinked: true });
    expect(platform.wallets).toEqual([]);
    pinJson("wallets unlink", json);
  });

  it("says so when the wallet is not linked", async () => {
    await signIn();
    const { error } = await run(WalletsUnlink, [
      "0x000000000000000000000000000000000000dEaD",
      "--yes",
    ]);

    expect(error).toMatchObject({ code: "WALLET_NOT_LINKED" });
  });
});
