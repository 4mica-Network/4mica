import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { Flags } from "@oclif/core";
import { askSecret } from "../../core/confirm.js";
import { saveToken } from "../../core/credentials.js";
import { readInput } from "../../core/input.js";
import {
  accountLabel,
  api,
  apiError,
  loadStoredSession,
  type Platform,
  request,
  TOKEN_PREFIX,
  whoAmI,
} from "../../core/platform.js";
import { openBrowser } from "../../core/runner.js";
import { canPrompt } from "../../core/runtime.js";
import { readEnv } from "../../core/settings.js";
import { cancelled, failure, usageError } from "../../errors.js";
import { PlatformCommand } from "../../platform-command.js";
import { brand, spinner } from "../../ui/log.js";
import { fields } from "../../ui/output.js";

/** RFC 8628's name for what this command does. */
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

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
  };
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --no-open",
    "cat token.txt | <%= config.bin %> <%= command.id %> --with-token",
  ];

  async run() {
    const { flags } = await this.parse(AuthLogin);
    const platform = await this.platform(flags);
    const dir = this.config.configDir;

    const token = flags["with-token"]
      ? requireToken(await readInput("-"))
      : await this.interactive(platform, flags);

    // Checked before it is kept: a token that does not work is not stored.
    const me = await whoAmI(platform, token);
    const previous = await loadStoredSession(dir);
    const kept = await saveToken(dir, platform.origin, token, {
      fileOnly: flags["insecure-storage"],
    });
    // The session this one replaces would otherwise stay valid for months.
    if (previous && previous.token !== token) {
      await request(platform, "/v1/cli/session", {
        method: "DELETE",
        token: previous.token,
      }).catch(() => undefined);
    }

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

  /** At a terminal with no flag saying how: ask, as `gh auth login` does. */
  private async interactive(
    platform: Platform,
    flags: { web: boolean; open: boolean; name?: string },
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
    return this.deviceFlow(platform, flags);
  }

  private async deviceFlow(
    platform: Platform,
    flags: { open: boolean; name?: string },
  ): Promise<string> {
    const device = await api<DeviceCode>(platform, "/v1/cli/device/code", {
      method: "POST",
      body: { client_name: (flags.name ?? hostname()).slice(0, 120) },
    });
    const page = device.verification_uri_complete;
    if (!/^https?:\/\//.test(page)) {
      throw failure("the platform gave an approval address that is not a URL", {
        code: "BAD_VERIFICATION_URI",
      });
    }

    // Not `note`: without these two lines there is no way to sign in, so
    // `--quiet` does not hide them.
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
    const deadline = Date.now() + device.expires_in * 1000;
    let interval = Math.max(device.interval, 1);
    try {
      while (Date.now() < deadline) {
        await sleep(interval * 1000);
        const response = await request(platform, "/v1/cli/device/token", {
          method: "POST",
          body: { grant_type: DEVICE_GRANT, device_code: device.device_code },
        });
        if (response.status === 200) {
          const { access_token } = response.body as { access_token?: unknown };
          if (typeof access_token === "string") return access_token;
        }
        const code = (response.body as { error?: unknown } | undefined)?.error;
        if (code === "authorization_pending") continue;
        if (code === "slow_down") {
          interval += 5;
          continue;
        }
        if (code === "access_denied") {
          throw failure("the sign-in was denied in the dashboard", {
            code: "ACCESS_DENIED",
          });
        }
        if (code === "expired_token") break;
        throw apiError(platform, response);
      }
    } finally {
      waiting.clear();
    }
    throw failure("the code expired before it was approved", {
      code: "LOGIN_EXPIRED",
      retryable: true,
      suggestions: ["run `4mica auth login` again for a new code"],
    });
  }
}
