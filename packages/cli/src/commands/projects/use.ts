import { Args } from "@oclif/core";
import { readContext, writeContext } from "../../core/config-file.js";
import { findProject, listProjects } from "../../core/workspace.js";
import { PlatformCommand } from "../../platform-command.js";

export default class ProjectsUse extends PlatformCommand {
  static summary = "make a project the one the cli acts in";
  static description =
    "Saves the project in the config file, for the organization in use. " +
    "--project or FOURMICA_PROJECT still take precedence for a run.";
  static args = {
    project: Args.string({
      description: "a slug or id from `4mica projects`",
      required: true,
    }),
  };
  static examples = ["<%= config.bin %> <%= command.id %> checkout"];

  async run() {
    const { args, flags } = await this.parse(ProjectsUse);
    const { session, context } = await this.workspace({
      ...flags,
      project: undefined,
    });
    const project = findProject(
      await listProjects(session.platform, session.token),
      args.project,
    );

    const dir = this.config.configDir;
    const saved = await readContext(dir);
    await writeContext(dir, {
      ...saved,
      project: {
        id: project.id,
        slug: project.slug,
        name: project.name,
        orgId: context.organization.id,
      },
    });
    this.note(`now acting in project ${project.slug}`);
    return { ...project, active: true };
  }
}
