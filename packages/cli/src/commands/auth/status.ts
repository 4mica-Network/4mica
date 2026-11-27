import { credentialsPath } from "../../core/credentials.js";
import {
  accountLabel,
  loadSession,
  notLoggedIn,
  whoAmI,
} from "../../core/platform.js";
import { PlatformCommand } from "../../platform-command.js";
import { fields } from "../../ui/output.js";

export default class AuthStatus extends PlatformCommand {
  static summary = "show the 4mica account the cli is signed in to";
  static description =
    "Asks the platform, so the answer is about the session as it is now: " +
    "one that was revoked in the dashboard is reported as invalid. The " +
    "token itself is never printed. For the wallet in use, see `4mica " +
    "whoami`: the two are separate.";
  static examples = ["<%= config.bin %> <%= command.id %>"];

  async run() {
    const { flags } = await this.parse(AuthStatus);
    const platform = await this.platform(flags);
    const session = await loadSession(this.config.configDir);
    if (!session) throw await notLoggedIn(this.config.configDir, platform);

    const me = await whoAmI(session.platform, session.token);
    const from =
      session.source === "env"
        ? "FOURMICA_TOKEN"
        : session.source === "keychain"
          ? "the system keychain"
          : credentialsPath(this.config.configDir);
    this.log(
      fields([
        ["account", accountLabel(me.user)],
        ["platform", session.platform.origin],
        ["session", `${me.session.name} (active)`],
        ["expires", me.session.expiresAt],
        ["allowed", me.session.scopes.join(", ")],
        ["token", `from ${from}`],
      ]),
    );
    return {
      account: me.user,
      session: me.session,
      apiUrl: session.platform.origin,
      tokenSource: session.source,
    };
  }
}
