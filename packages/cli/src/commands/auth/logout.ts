import { Flags } from "@oclif/core";
import {
  removeToken,
  type SessionKind,
  withCredentialLock,
} from "../../core/credentials.js";
import {
  loadStoredSession,
  type Platform,
  request,
  whoAmI,
} from "../../core/platform.js";
import { readEnv } from "../../core/settings.js";
import { PlatformCommand } from "../../platform-command.js";

type Outcome = "revoked" | "kept" | "unreachable" | "none";

export default class AuthLogout extends PlatformCommand {
  static summary = "sign the cli out of your 4mica account";
  static description =
    "Forgets the token here. A session `auth login` made in the browser is " +
    "also revoked on the platform, so a copy of it is worthless too. A token " +
    "made in the dashboard may be in use elsewhere, such as in CI, so it is " +
    "left valid unless --revoke is passed. Wallet keys are not touched.";
  static flags = {
    revoke: Flags.boolean({
      summary:
        "revoke the token on the platform even if it came from the dashboard",
    }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --revoke",
  ];

  async run() {
    const { flags } = await this.parse(AuthLogout);
    const platform = await this.platform(flags);
    const dir = this.config.configDir;
    const fromEnv = Boolean(readEnv(process.env, "TOKEN"));

    const stored = await withCredentialLock(dir, platform.origin, async () => {
      const found = await loadStoredSession(dir);
      if (found) await removeToken(dir, platform.origin);
      return found;
    });

    const outcome: Outcome = stored
      ? await this.retire(platform, stored.token, stored.kind, flags.revoke)
      : "none";

    if (outcome === "none") {
      this.note("not signed in; nothing to do");
    } else if (outcome === "revoked") {
      this.note("signed out; the token was revoked");
    } else if (outcome === "kept") {
      this.note(
        "signed out here; the token came from the dashboard and is still valid, as it may be in use elsewhere. Pass --revoke to revoke it too",
      );
    } else {
      this.warning(
        `signed out here, but ${platform.origin} could not be reached to ` +
          "revoke the token; revoke it in the dashboard under Settings → Developer",
      );
    }
    if (fromEnv) {
      this.warning(
        "FOURMICA_TOKEN is still set, and commands will keep using it",
      );
    }
    return {
      loggedOut: Boolean(stored),
      revoked: outcome === "revoked",
      apiUrl: platform.origin,
    };
  }

  private async retire(
    platform: Platform,
    token: string,
    known: SessionKind | undefined,
    force: boolean,
  ): Promise<Outcome> {
    let kind = known;
    if (!kind && !force) {
      try {
        kind = (await whoAmI(platform, token)).session.kind;
      } catch (error) {
        return (error as { code?: unknown }).code === "SESSION_INVALID"
          ? "revoked"
          : "unreachable";
      }
    }
    if (kind === "TOKEN" && !force) return "kept";
    try {
      const response = await request(platform, "/v1/cli/session", {
        method: "DELETE",
        token,
      });
      return response.status === 204 || response.status === 401
        ? "revoked"
        : "unreachable";
    } catch {
      return "unreachable";
    }
  }
}
