import { existsSync } from "node:fs";
import { join } from "node:path";
import { Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";
import { readConfig } from "./core/config-file.js";
import { readKeyFile } from "./core/key-file.js";
import { installRequestTimeout } from "./core/net.js";
import {
  loadEnvFile,
  resolveSettings,
  type Settings,
} from "./core/settings.js";

/** Commands that talk to a 4mica network. */
export abstract class NetworkCommand extends BaseCommand {
  static baseFlags = {
    ...BaseCommand.baseFlags,
    // No `-n`: by convention that is `--dry-run`.
    network: Flags.string({
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
    "key-file": Flags.string({
      helpGroup: "GLOBAL",
      helpValue: "<path>",
      summary: "file holding the wallet key; - reads it from stdin",
    }),
    "env-file": Flags.file({
      exists: true,
      helpGroup: "GLOBAL",
      helpValue: "<path>",
      summary: "read FOURMICA_* variables from this file instead of ./.env",
    }),
    "request-timeout": Flags.integer({
      default: 30,
      helpGroup: "GLOBAL",
      helpValue: "<seconds>",
      min: 1,
      summary: "give up on a request that gets no response",
    }),
  };

  protected async settings(flags: {
    network?: string;
    "rpc-url"?: string;
    "key-file"?: string;
    "env-file"?: string;
    "request-timeout": number;
    asset?: string;
  }): Promise<Settings> {
    installRequestTimeout(flags["request-timeout"]);

    // A project's own .env applies without being asked for, as it does for
    // the project's code. Only this directory: no walking up to a parent's.
    const local = join(process.cwd(), ".env");
    const envFilePath =
      flags["env-file"] ?? (existsSync(local) ? local : undefined);

    const config = await readConfig(this.config.configDir);
    const keyFile = flags["key-file"]
      ? await readKeyFile(flags["key-file"], "flag")
      : config["key-file"]
        ? await readKeyFile(config["key-file"], "config")
        : undefined;

    return resolveSettings({
      flags,
      env: process.env,
      envFile: envFilePath ? await loadEnvFile(envFilePath) : undefined,
      envFilePath,
      keyFile,
      config,
    });
  }
}
