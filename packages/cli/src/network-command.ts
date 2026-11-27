import { existsSync } from "node:fs";
import { join } from "node:path";
import { Flags } from "@oclif/core";
import { BaseCommand } from "./base.js";
import { readConfig } from "./core/config-file.js";
import { readKeyFile } from "./core/key-file.js";
import {
  installRequestTimeout,
  MAX_TIMEOUT_SECS,
  routeThroughEnvProxy,
} from "./core/net.js";
import { setExplorer } from "./core/outcome.js";
import { requireSession, type Session } from "./core/platform.js";
import { type Preview, renderPreview } from "./core/preview.js";
import {
  type KeyFile,
  loadEnvFile,
  readEnv,
  resolveSettings,
  type Settings,
} from "./core/settings.js";
import { configError, EXIT } from "./errors.js";

/** Read by the account commands from the environment only, never a file. */
const PLATFORM_VARIABLES = ["API_URL", "TOKEN"] as const;

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
      aliases: ["core-url"],
      helpGroup: "GLOBAL",
      helpValue: "<url>",
      summary:
        "core url of a network that is not in `4mica networks` (not an Ethereum RPC endpoint)",
    }),
    "key-file": Flags.string({
      helpGroup: "GLOBAL",
      helpValue: "<path>",
      summary: "file holding the wallet key; - reads it from stdin",
    }),
    // Not `--env-file`: Node reads that name from argv itself, before this
    // code runs, and exits 9 when the file is missing.
    dotenv: Flags.file({
      exists: true,
      helpGroup: "GLOBAL",
      helpValue: "<path>",
      summary: "read FOURMICA_* variables from this file instead of ./.env",
    }),
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

  /**
   * Prints what a dry run found. Exit code 1 when something blocks the real
   * command, so a script can branch on a dry run.
   */
  protected showPreview(preview: Preview): void {
    this.log(renderPreview(preview));
    if (!preview.ready) this.exitStatus(EXIT.failure);
  }

  /**
   * The signed-in account, for a command that also uses a wallet. The account
   * comes from the environment and the saved sign-in, as for `4mica auth`;
   * an env file that tries to choose it is refused, since the network would
   * follow the file and the account would not, and a wallet on one platform
   * would be linked to an account on another.
   */
  protected async accountSession(settings: Settings): Promise<Session> {
    const fromFile = PLATFORM_VARIABLES.filter(
      (name) =>
        settings.sdkEnv[`FOURMICA_${name}`] !== undefined &&
        !readEnv(process.env, name),
    );
    if (fromFile.length > 0) {
      const names = fromFile.map((name) => `FOURMICA_${name}`).join(" and ");
      throw configError(
        `${settings.envFilePath} sets ${names}, which choose the 4mica ` +
          "account and are read only from the environment",
        {
          code: "PLATFORM_ENV_IN_FILE",
          suggestions: [
            `set ${names} in the shell instead, as for \`4mica auth login\``,
            `or remove ${fromFile.length > 1 ? "them" : "it"} from ${settings.envFilePath}`,
          ],
        },
      );
    }
    return requireSession(this.config.configDir);
  }

  protected async settings(flags: {
    network?: string;
    "rpc-url"?: string;
    "key-file"?: string;
    dotenv?: string;
    "request-timeout": number;
    asset?: string;
  }): Promise<Settings> {
    // A project's own .env applies without being asked for, as it does for
    // the project's code. Only this directory: no walking up to a parent's.
    const local = join(process.cwd(), ".env");
    const envFilePath = flags.dotenv ?? (existsSync(local) ? local : undefined);

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
      envFileFound: envFilePath !== undefined && !flags.dotenv,
      keyFile,
      keyProblem,
      config,
    });
    // Nothing above makes a request.
    await routeThroughEnvProxy();
    installRequestTimeout(flags["request-timeout"], [
      settings.rpcUrl.value,
      settings.facilitatorUrl?.value,
    ]);
    setExplorer(settings.info?.explorerUrl);
    return settings;
  }
}
