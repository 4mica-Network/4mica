import { hostname } from "node:os";
import { Flags } from "@oclif/core";
import { askSecret } from "../../core/confirm.js";
import {
  type SessionKind,
  saveToken,
  withCredentialLock,
} from "../../core/credentials.js";
import { isDeviceCode, pollForToken } from "../../core/device-flow.js";
import { readInput } from "../../core/input.js";
import {
  accountLabel,
  api,
  badResponse,
  type Platform,
  readStoredSession,
  request,
  TOKEN_PREFIX,
  whoAmI,
} from "../../core/platform.js";
import { openBrowser } from "../../core/runner.js";
import { canPrompt } from "../../core/runtime.js";
import { readEnv } from "../../core/settings.js";
import { cancelled, usageError } from "../../errors.js";
import { PlatformCommand } from "../../platform-command.js";
import { brand, spinner } from "../../ui/log.js";
import { fields } from "../../ui/output.js";

function requireToken(value: string): string {
  const token = value.trim();
  if (token.startsWith(TOKEN_PREFIX) && !/\s/.test(token)) return token;
  throw usageError("that is not a 4mica CLI token", {
    code: "BAD_TOKEN",
    suggestions: [
      `a token starts with ${TOKEN_PREFIX}; make one in the dashboard under Settings → Developer`,
    ],
  });
}

export default class AuthLogin extends PlatformCommand {
  static summary = "sign the cli in to your 4mica account";
  static description =
    "Shows a one-time code and opens the dashboard, where you approve it " +
    "while signed in; the cli then receives a token of its own. Nothing is " +
    "typed into the terminal, so it also works over SSH: open the address " +
    "on any device. The token is kept in the system keychain when there is " +
    "one, and otherwise in a file only you can read.\n\n" +
    "Signing in gives the cli access to the account: who you are, and the " +
    "wallets linked to it. It does not touch a wallet key, and cannot move " +
    "funds; commands that pay still sign with the wallet in `4mica whoami`.";
  static flags = {
    "with-token": Flags.boolean({
      summary: "read a token from stdin instead, as CI does",
    }),
    web: Flags.boolean({
      exclusive: ["with-token"],
      summary: "go straight to the browser, without asking how to sign in",
    }),
    open: Flags.boolean({
      allowNo: true,
      default: true,
      summary: "open the approval page in a browser",
    }),
    name: Flags.string({
      helpValue: "<label>",
      summary:
        "what the dashboard calls this session; this machine's name by default",
    }),
    "insecure-storage": Flags.boolean({
      summary: "keep the token in a file, not in the system keychain",
    }),
    scopes: Flags.string({
      exclusive: ["with-token"],
      helpValue: "<scope,...>",
      summary:
        "what the session may do; account:read, wallets:read and wallets:link by default, add wallets:unlink to remove wallets",
    }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --no-open",
    "<%= config.bin %> <%= command.id %> --scopes account:read,wallets:read,wallets:link,wallets:unlink",
    "cat token.txt | <%= config.bin %> <%= command.id %> --with-token",
  ];

  async run() {
    const { flags } = await this.parse(AuthLogin);
    const platform = await this.platform(flags);
    const dir = this.config.configDir;

    let minted = false;
    const token = flags["with-token"]
      ? requireToken(await readInput("-"))
      : await this.interactive(platform, flags, () => {
          minted = true;
        });

    const { me, kept } = await withCredentialLock(
      dir,
      platform.origin,
      async () => {
        const me = await whoAmI(platform, token);
        const before = await readStoredSession(dir);
        let saved: Awaited<ReturnType<typeof saveToken>>;
        try {
          saved = await saveToken(dir, platform.origin, token, {
            kind: me.session.kind,
            fileOnly: flags["insecure-storage"],
          });
        } catch (error) {
          if (minted) await revokeToken(platform, token);
          throw error;
        }
        if (before.status === "found" && before.session.token !== token) {
          await this.retire(
            platform,
            before.session.token,
            before.session.kind,
          );
        }
        return { me, kept: saved };
      },
    );

    this.note(`Signed in as ${brand(accountLabel(me.user))}`);
    this.note(`token kept in ${kept.where}`);
    if (readEnv(process.env, "TOKEN")) {
      this.warning(
        "FOURMICA_TOKEN is set and is used instead of the token just stored",
      );
    }
    this.log(
      fields([
        ["account", accountLabel(me.user)],
        ["platform", platform.origin],
        ["session", me.session.name],
        ["expires", me.session.expiresAt],
      ]),
    );
    return {
      account: me.user,
      session: me.session,
      apiUrl: platform.origin,
      storage: kept.storage,
    };
  }

  private async retire(
    platform: Platform,
    token: string,
    known: SessionKind | undefined,
  ): Promise<void> {
    const kind =
      known ??
      (await whoAmI(platform, token).then(
        (me) => me.session.kind,
        () => undefined,
      ));
    if (kind === "DEVICE") {
      await revokeToken(platform, token);
      return;
    }
    if (kind === "TOKEN") {
      this.note(
        "the token used before is still valid, as it may be in use elsewhere; revoke it under Settings → Developer if it is not",
      );
    }
  }

  private async interactive(
    platform: Platform,
    flags: { web: boolean; open: boolean; name?: string; scopes?: string },
    onMinted: () => void,
  ): Promise<string> {
    if (!flags.web && canPrompt()) {
      const { isCancel, select } = await import("@clack/prompts");
      const how = await select({
        message: "How would you like to sign in?",
        options: [
          { value: "browser", label: "Sign in with a browser" },
          { value: "token", label: "Paste a token" },
        ],
        output: process.stderr,
      });
      if (isCancel(how)) throw cancelled("cancelled; not signed in");
      if (how === "token") {
        return requireToken(
          await askSecret("Token", {
            cancelMessage: "cancelled; not signed in",
          }),
        );
      }
    }
    const token = await this.deviceFlow(platform, flags);
    onMinted();
    return token;
  }

  private async deviceFlow(
    platform: Platform,
    flags: { open: boolean; name?: string; scopes?: string },
  ): Promise<string> {
    const scope = flags.scopes
      ?.split(/[\s,]+/)
      .filter(Boolean)
      .join(" ");
    const device = await api<unknown>(platform, "/v1/cli/device/code", {
      method: "POST",
      body: {
        client_name: (flags.name ?? hostname()).slice(0, 120),
        ...(scope ? { scope } : {}),
      },
    });
    if (!isDeviceCode(device)) throw badResponse("a sign-in code");
    const deadline = Date.now() + device.expires_in * 1000;
    const page = device.verification_uri_complete;

    process.stderr.write(
      `Your one-time code: ${brand(device.user_code)}\n` +
        `Approve it at ${page}\n`,
    );
    if (flags.open) {
      await openBrowser(page);
    } else {
      this.note("open that address in a browser on any device");
    }

    const waiting = spinner("Waiting for approval in the browser");
    try {
      return await pollForToken(platform, device, deadline, (message) =>
        this.note(message),
      );
    } finally {
      waiting.clear();
    }
  }
}

const revokeToken = (platform: Platform, token: string) =>
  request(platform, "/v1/cli/session", { method: "DELETE", token }).then(
    () => undefined,
    () => undefined,
  );
