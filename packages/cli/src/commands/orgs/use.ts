import { Args } from "@oclif/core";
import { readContext, writeContext } from "../../core/config-file.js";
import { findOrganization, listOrganizations } from "../../core/workspace.js";
import { PlatformCommand } from "../../platform-command.js";

export default class OrgsUse extends PlatformCommand {
  static summary = "make an organization the one the cli acts in";
  static description =
    "Saves the organization in the config file, so every request to the " +
    "platform is made in it. Switching organization also goes back to its " +
    "default project. --org or FOURMICA_ORG still take precedence for a run.";
  static args = {
    org: Args.string({
      description: "a handle or id from `4mica orgs`",
      required: true,
    }),
  };
  static examples = ["<%= config.bin %> <%= command.id %> acme"];

  async run() {
    const { args, flags } = await this.parse(OrgsUse);
    const { platform, token } = await this.session(flags);
    const { items } = await listOrganizations(platform, token);
    const org = findOrganization(items, args.org);

    const dir = this.config.configDir;
    const saved = await readContext(dir);
    const moved = saved.org?.id !== org.id;
    await writeContext(dir, {
      ...saved,
      org: { id: org.id, handle: org.handle, name: org.name },
      project: moved ? undefined : saved.project,
    });
    this.note(`now acting in ${org.handle ?? org.name}`);
    if (moved && saved.project) {
      this.note("using that organization's default project");
    }
    return { ...org, active: true };
  }
}
