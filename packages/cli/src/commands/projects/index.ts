import { listProjects } from "../../core/workspace.js";
import { PlatformCommand } from "../../platform-command.js";
import { table } from "../../ui/output.js";

export default class Projects extends PlatformCommand {
  static summary = "list the projects you can see in the organization in use";
  static description =
    "Projects hold agents, APIs, keys and webhooks, each kept apart in a " +
    "sandbox and a production environment. The one in use is marked; " +
    "change it with `4mica projects use`.";
  static aliases = ["projects:list"];
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --org acme",
  ];

  async run() {
    const { flags } = await this.parse(Projects);
    const { session, context } = await this.workspace(flags);
    const items = await listProjects(session.platform, session.token);
    const projects = items.map((project) => ({
      ...project,
      active: context.project.id
        ? project.id === context.project.id
        : project.isDefault,
    }));

    this.log(
      table(
        ["SLUG", "NAME", "ROLE", "IN USE"],
        projects.map((project) => [
          project.slug,
          project.archived ? `${project.name} (archived)` : project.name,
          project.role.toLowerCase(),
          project.active ? "yes" : "-",
        ]),
      ),
    );
    return projects;
  }
}
