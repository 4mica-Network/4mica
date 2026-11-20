import { walletAddress } from "../core/session.js";
import { networkName, origin, type Resolved } from "../core/settings.js";
import { NetworkCommand } from "../network-command.js";
import { fields } from "../ui/output.js";

export default class Whoami extends NetworkCommand {
  static summary = "show the wallet and network the cli will use";
  static description =
    "Makes no network call. The address is derived from the wallet key, " +
    "which is never printed. The key is taken from --key-file, then " +
    "FOURMICA_WALLET_PRIVATE_KEY in the environment or in ./.env, then the " +
    "key file named in the config file.";
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --key-file ~/.4mica/key",
  ];

  async run() {
    const { flags } = await this.parse(Whoami);
    const settings = await this.settings(flags);
    const address = await walletAddress(settings);
    const from = (resolved: Resolved) =>
      ` (from ${origin(settings, resolved)})`;
    this.log(
      fields([
        [
          "address",
          `${address} (from ${settings.key?.file ?? settings.key?.source})`,
        ],
        [
          "network",
          networkName(settings) + from(settings.network ?? settings.rpcUrl),
        ],
        ["core", settings.rpcUrl.value],
        [
          "facilitator",
          settings.facilitatorUrl &&
            settings.facilitatorUrl.value + from(settings.facilitatorUrl),
        ],
      ]),
    );
    return {
      address,
      key: settings.key,
      network: settings.network,
      rpcUrl: settings.rpcUrl,
      facilitatorUrl: settings.facilitatorUrl,
    };
  }
}
