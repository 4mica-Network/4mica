import { listOrganizations } from "../../core/workspace.js";
import { PlatformCommand } from "../../platform-command.js";
import { table } from "../../ui/output.js";

export default class Orgs extends PlatformCommand {
  static summary = "list the organizations you can act in";
  static description =
    "The organizations your 4mica account belongs to, and your role in " +
    "each. A session limited to one organization sees only that one. The " +
    "one in use is marked; change it with `4mica orgs use`.";
  static aliases = ["orgs:list"];
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --json",
  ];

  async run() {
    const { flags } = await this.parse(Orgs);
    const { session, context } = await this.workspace(flags);
    const { items, defaultId } = await listOrganizations(
      session.platform,
      session.token,
    );
    const activeId = context.organization.id ?? defaultId;
    const orgs = items.map((org) => ({ ...org, active: org.id === activeId }));

    this.log(
      table(
        ["HANDLE", "NAME", "ROLE", "IN USE"],
        orgs.map((org) => [
          org.handle ?? "-",
          org.name || "-",
          org.role.toLowerCase(),
          org.active ? "yes" : "-",
        ]),
      ),
    );
    return orgs;
  }
}
