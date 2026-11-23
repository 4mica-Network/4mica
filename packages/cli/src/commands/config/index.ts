import { configPath } from "../../core/config-file.js";
import { origin, type Resolved } from "../../core/settings.js";
import { NetworkCommand } from "../../network-command.js";
import { warn } from "../../ui/log.js";
import { table } from "../../ui/output.js";

export default class Config extends NetworkCommand {
  static summary = "show the settings in effect and where each comes from";
  static description =
    "A setting is taken from the first of these that has it: a flag, an " +
    "environment variable, the file given by --env-file, the config file, " +
    "the built-in default.";
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> set network base",
    "<%= config.bin %> <%= command.id %> set asset USDC",
  ];

  async run() {
    const { flags } = await this.parse(Config);
    const settings = await this.settings(flags);
    // Shown here rather than fatal: this is where a stale path gets fixed.
    if (settings.keyProblem) this.note(warn(settings.keyProblem.message));
    const effective: Record<string, Resolved | undefined> = {
      network: settings.network,
      "rpc-url": settings.rpcUrl,
      "facilitator-url": settings.facilitatorUrl,
      asset: settings.asset,
      "key-file":
        settings.key?.source === "flag" || settings.key?.source === "config"
          ? { value: settings.key.file as string, source: settings.key.source }
          : undefined,
    };
    const row = (key: string, setting?: Resolved) => [
      key,
      setting?.value ?? "-",
      setting ? origin(settings, setting) : "-",
    ];
    this.log(
      table(
        ["SETTING", "VALUE", "FROM"],
        [
          ...Object.entries(effective).map(([key, s]) => row(key, s)),
          // Whether it is set, never what it is.
          [
            "wallet-key",
            settings.key ? "set" : "-",
            (settings.key?.source === "env-file"
              ? settings.key.file
              : settings.key?.source) ?? "-",
          ],
        ],
      ),
    );
    return {
      file: configPath(this.config.configDir),
      settings: effective,
      walletKey: { set: Boolean(settings.key), ...settings.key },
    };
  }
}
