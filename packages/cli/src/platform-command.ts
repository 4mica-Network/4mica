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
  };

  protected async platform(flags: {
    "request-timeout": number;
  }): Promise<Platform> {
    const platform = resolvePlatform();
    await routeThroughEnvProxy();
    installRequestTimeout(flags["request-timeout"]);
    return platform;
  }

  protected async session(flags: {
    "request-timeout": number;
  }): Promise<Session> {
    await this.platform(flags);
    return requireSession(this.config.configDir);
  }
}
