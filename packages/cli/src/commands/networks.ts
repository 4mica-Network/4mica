import { DEFAULT_NETWORK, NETWORKS } from "@4mica/sdk/networks";
import { BaseCommand } from "../base.js";
import { table } from "../ui/output.js";

export default class Networks extends BaseCommand {
  static summary = "list supported networks";
  static examples = ["<%= config.bin %> <%= command.id %>"];

  async run() {
    await this.parse(Networks);
    const networks = Object.entries(NETWORKS).map(([name, info]) => ({
      name,
      ...info,
      default: name === DEFAULT_NETWORK,
    }));
    this.log(
      table(
        ["NAME", "CHAIN", "KIND", "CORE", "FACILITATOR", "EXPLORER"],
        networks.map((n) => [
          n.name,
          n.caip2,
          n.testnet ? "testnet" : "mainnet",
          n.rpcUrl,
          n.facilitatorUrl ?? "-",
          n.explorerUrl,
        ]),
      ),
    );
    this.note(`default: ${DEFAULT_NETWORK}`);
    return networks;
  }
}
