import { walletAddress } from "../core/session.js";
import { networkName } from "../core/settings.js";
import { NetworkCommand } from "../network-command.js";
import { fields } from "../ui/output.js";

export default class Whoami extends NetworkCommand {
  static summary = "show the wallet and network the cli will use";
  static description =
    "Makes no network call. The address is derived from the wallet key, " +
    "which is read from FOURMICA_WALLET_PRIVATE_KEY or --env-file and is " +
    "never printed.";
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --env-file .env",
  ];

  async run() {
    const { flags } = await this.parse(Whoami);
    const settings = await this.settings(flags);
    const address = await walletAddress(settings);
    const from = (source?: string) => (source ? ` (from ${source})` : "");
    this.log(
      fields([
        ["address", address + from(settings.key?.source)],
        [
          "network",
          networkName(settings) +
            from((settings.network ?? settings.rpcUrl).source),
        ],
        ["core", settings.rpcUrl.value],
        [
          "facilitator",
          settings.facilitatorUrl &&
            settings.facilitatorUrl.value +
              from(settings.facilitatorUrl.source),
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
