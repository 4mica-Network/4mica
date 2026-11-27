import { Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";
import {
  installRequestTimeout,
  MAX_TIMEOUT_SECS,
  routeThroughEnvProxy,
} from "./core/net.js";
import {
  type Platform,
  requireSession,
  resolvePlatform,
  type Session,
} from "./core/platform.js";
import {
  type ActiveContext,
  type ContextFlags,
  resolveContext,
} from "./core/workspace.js";

interface PlatformFlags extends ContextFlags {
  "request-timeout": number;
}

export abstract class PlatformCommand extends BaseCommand {
  static baseFlags = {
    ...BaseCommand.baseFlags,
    "request-timeout": Flags.integer({
      default: 30,
      env: "FOURMICA_REQUEST_TIMEOUT",
      helpGroup: "GLOBAL",
      helpValue: "<seconds>",
      max: MAX_TIMEOUT_SECS,
      min: 1,
      summary:
        "give up on a request that waits this long for an answer, or for more of one",
    }),
    org: Flags.string({
      helpGroup: "GLOBAL",
      helpValue: "<handle|id>",
      summary:
        "the organization to act in; FOURMICA_ORG does the same, `4mica orgs use` saves one",
    }),
    project: Flags.string({
      helpGroup: "GLOBAL",
      helpValue: "<slug|id>",
      summary:
        "the project to act in; FOURMICA_PROJECT does the same, `4mica projects use` saves one",
    }),
    env: Flags.string({
      helpGroup: "GLOBAL",
      helpValue: "<sandbox|production>",
      summary:
        "the environment to act in; FOURMICA_ENV does the same, `4mica env use` saves one",
    }),
  };

  protected async platform(flags: PlatformFlags): Promise<Platform> {
    const platform = resolvePlatform();
    await routeThroughEnvProxy();
    installRequestTimeout(flags["request-timeout"]);
    return platform;
  }

  protected async workspace(
    flags: PlatformFlags,
  ): Promise<{ session: Session; context: ActiveContext }> {
    await this.platform(flags);
    const dir = this.config.configDir;
    return resolveContext(await requireSession(dir), dir, flags);
  }

  protected async session(flags: PlatformFlags): Promise<Session> {
    return (await this.workspace(flags)).session;
  }
}
