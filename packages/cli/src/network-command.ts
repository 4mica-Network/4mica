import { Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";
import { readConfig } from "./core/config-file.js";
import {
  loadEnvFile,
  resolveSettings,
  type Settings,
} from "./core/settings.js";

/** Commands that talk to a 4mica network. */
export abstract class NetworkCommand extends BaseCommand {
  static baseFlags = {
    ...BaseCommand.baseFlags,
    network: Flags.string({
      char: "n",
      exclusive: ["rpc-url"],
      helpGroup: "GLOBAL",
      helpValue: "<name>",
      summary: "network to use; FOURMICA_NETWORK does the same",
    }),
    "rpc-url": Flags.string({
      helpGroup: "GLOBAL",
      helpValue: "<url>",
      summary: "core url of a network that is not in `4mica networks`",
    }),
    "env-file": Flags.file({
      exists: true,
      helpGroup: "GLOBAL",
      helpValue: "<path>",
      summary: "read FOURMICA_* variables from a file, such as .env",
    }),
  };

  protected async settings(flags: {
    network?: string;
    "rpc-url"?: string;
    "env-file"?: string;
    asset?: string;
  }): Promise<Settings> {
    return resolveSettings({
      flags,
      env: process.env,
      envFile: flags["env-file"]
        ? await loadEnvFile(flags["env-file"])
        : undefined,
      config: await readConfig(this.config.configDir),
    });
  }
}
