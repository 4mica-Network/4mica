import {
  accountLabel,
  loadSession,
  notLoggedIn,
  whoAmI,
} from "../../core/platform.js";
import {
  applyBinding,
  contextFields,
  resolveContext,
} from "../../core/workspace.js";
import { PlatformCommand } from "../../platform-command.js";
import { fields } from "../../ui/output.js";

export default class AuthStatus extends PlatformCommand {
  static summary = "show the 4mica account the cli is signed in to";
  static description =
    "Asks the platform, so the answer is about the session as it is now: " +
    "one that was revoked in the dashboard is reported as invalid. It also " +
    "names the organization, project and environment requests are made in. " +
    "The token itself is never printed. For the wallet in use, see `4mica " +
    "whoami`: the two are separate.";
  static examples = ["<%= config.bin %> <%= command.id %>"];

  async run() {
    const { flags } = await this.parse(AuthStatus);
    const platform = await this.platform(flags);
    const dir = this.config.configDir;
    const stored = await loadSession(dir);
    if (!stored) throw await notLoggedIn(dir, platform);

    const me = await whoAmI(stored.platform, stored.token);
    const resolved = await resolveContext(stored, dir, flags);
    const session = resolved.session;
    const { context, conflict } = applyBinding(
      resolved.context,
      me.organization,
    );
    if (conflict) this.warning(conflict);
    const from =
      session.source === "env"
        ? "FOURMICA_TOKEN"
        : session.source === "keychain"
          ? "the system keychain"
          : (session.where ?? "a file");
    this.log(
      fields([
        ["account", accountLabel(me.user)],
        ["platform", session.platform.origin],
        ["session", `${me.session.name} (active)`],
        ["expires", me.session.expiresAt],
        ["allowed", me.session.scopes.join(", ")],
        ["token", `from ${from}`],
        ...contextFields(context),
      ]),
    );
    return {
      account: me.user,
      session: me.session,
      context,
      apiUrl: session.platform.origin,
      tokenSource: session.source,
    };
  }
}
