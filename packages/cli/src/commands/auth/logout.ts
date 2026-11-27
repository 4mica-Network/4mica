import { removeToken } from "../../core/credentials.js";
import { loadStoredSession, request } from "../../core/platform.js";
import { readEnv } from "../../core/settings.js";
import { PlatformCommand } from "../../platform-command.js";

export default class AuthLogout extends PlatformCommand {
  static summary = "sign the cli out of your 4mica account";
  static description =
    "Revokes the cli's token on the platform, so that a copy of it is " +
    "worthless too, then forgets it here. Wallet keys are not touched.";
  static examples = ["<%= config.bin %> <%= command.id %>"];

  async run() {
    const { flags } = await this.parse(AuthLogout);
    const platform = await this.platform(flags);
    const dir = this.config.configDir;
    // The stored token only: FOURMICA_TOKEN belongs to whoever set it.
    const stored = await loadStoredSession(dir);
    const fromEnv = Boolean(readEnv(process.env, "TOKEN"));

    let revoked = false;
    if (stored) {
      try {
        const response = await request(platform, "/v1/cli/session", {
          method: "DELETE",
          token: stored.token,
        });
        // 401: it was already revoked or had expired, which is as good.
        revoked = response.status === 204 || response.status === 401;
      } catch {
        revoked = false;
      }
      await removeToken(dir, platform.origin);
    }

    if (!stored) {
      this.note("not signed in; nothing to do");
    } else if (revoked) {
      this.note("signed out; the token was revoked");
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
      revoked,
      apiUrl: platform.origin,
    };
  }
}
