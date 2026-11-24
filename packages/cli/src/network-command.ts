import { existsSync } from "node:fs";
import { join } from "node:path";
import { Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";
import { readConfig } from "./core/config-file.js";
import { readKeyFile } from "./core/key-file.js";
import { installRequestTimeout, MAX_TIMEOUT_SECS } from "./core/net.js";
import {
  type KeyFile,
  loadEnvFile,
  readEnv,
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
      max: MAX_TIMEOUT_SECS,
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
    // A project's own .env applies without being asked for, as it does for
    // the project's code. Only this directory: no walking up to a parent's.
    const local = join(process.cwd(), ".env");
    const envFilePath =
      flags["env-file"] ?? (existsSync(local) ? local : undefined);

    const envFile = envFilePath ? await loadEnvFile(envFilePath) : undefined;
    const config = await readConfig(this.config.configDir);

    // The config file's key file is the last resort, so it is read only when
    // nothing above it has a key, and a path that has gone stale fails the
    // commands that need a wallet, not `4mica tokens`.
    let keyFile: KeyFile | undefined;
    let keyProblem: Error | undefined;
    if (flags["key-file"]) {
      keyFile = await readKeyFile(flags["key-file"], "flag");
    } else if (
      config["key-file"] &&
      !readEnv(process.env, "WALLET_PRIVATE_KEY") &&
      !readEnv(envFile ?? {}, "WALLET_PRIVATE_KEY")
    ) {
      try {
        keyFile = await readKeyFile(config["key-file"], "config");
      } catch (error) {
        keyProblem = error as Error;
      }
    }

    const settings = resolveSettings({
      flags,
      env: process.env,
      envFile,
      envFilePath,
      envFileFound: envFilePath !== undefined && !flags["env-file"],
      keyFile,
      keyProblem,
      config,
    });
    // Nothing above makes a request.
    installRequestTimeout(flags["request-timeout"], [
      settings.rpcUrl.value,
      settings.facilitatorUrl?.value,
    ]);
    return settings;
  }
}
