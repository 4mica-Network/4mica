import { listLinkedWallets } from "../core/linked-wallets.js";
import { accountLabel, requireScopes, whoAmI } from "../core/platform.js";
import { applyBinding, contextFields } from "../core/workspace.js";
import { PlatformCommand } from "../platform-command.js";
import { fields, table } from "../ui/output.js";

export default class Account extends PlatformCommand {
  static summary = "show your 4mica account and the wallets linked to it";
  static description =
    "The account the cli is signed in to, from the platform, with the " +
    "wallets it has proved it holds in the organization in use. Needs " +
    "`4mica auth login` first.";
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --json",
  ];

  async run() {
    const { flags } = await this.parse(Account);
    const workspace = await this.workspace(flags);
    const { platform, token } = workspace.session;
    const me = await whoAmI(platform, token);
    requireScopes(me.session, ["wallets:read"]);
    const { context, conflict } = applyBinding(
      workspace.context,
      me.organization,
    );
    if (conflict) this.warning(conflict);
    const wallets = await listLinkedWallets(platform, token);

    this.log(
      fields([
        ["account", accountLabel(me.user)],
        ["name", me.user.name || undefined],
        ["username", me.user.username ?? undefined],
        ["platform", platform.origin],
        ...contextFields(context),
      ]),
    );
    this.log("");
    this.log(
      table(
        [`LINKED WALLETS (${wallets.length})`, "NETWORK", "LABEL", "STATUS"],
        wallets.map((w) => [
          w.address,
          w.network.toLowerCase().replaceAll("_", "-"),
          w.label,
          w.status.toLowerCase(),
        ]),
      ),
    );
    if (wallets.length === 0) {
      this.note("no wallets linked yet; link one with `4mica wallets link`");
    }
    return { account: me.user, context, wallets };
  }
}
