import { networkName } from "../core/settings.js";
import { NetworkCommand } from "../network-command.js";
import { waiting } from "../ui/log.js";
import { table } from "../ui/output.js";

export default class Tokens extends NetworkCommand {
  static summary = "list tokens accepted as collateral";
  static description =
    "The network's native asset is accepted too, and is never listed.";
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --network base",
  ];

  async run() {
    const { flags } = await this.parse(Tokens);
    const settings = await this.settings(flags);
    const { RpcProxy } = await import("@4mica/sdk");
    const { chainId, tokens } = await waiting(
      `Asking ${networkName(settings)} for its tokens`,
      () => new RpcProxy(settings.rpcUrl.value).getSupportedTokens(),
    );
    this.log(
      table(
        ["SYMBOL", "ADDRESS", "DECIMALS"],
        tokens.map((t) => [t.symbol, t.address, String(t.decimals)]),
      ),
    );
    return { network: networkName(settings), chainId, tokens };
  }
}
