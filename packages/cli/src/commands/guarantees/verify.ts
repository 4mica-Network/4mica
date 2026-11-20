import { Args } from "@oclif/core";
import { readInput } from "../../core/input.js";
import { networkName } from "../../core/settings.js";
import { failure, usageError } from "../../errors.js";
import { NetworkCommand } from "../../network-command.js";
import { waiting } from "../../ui/log.js";
import { fields } from "../../ui/output.js";

export default class GuaranteesVerify extends NetworkCommand {
  static summary = "check that a guarantee receipt was signed by 4mica";
  static description =
    'Takes a receipt as JSON, `{"receipt": "0x…", "signature": "0x…"}`, ' +
    "and checks its signature against the network's guarantee signer. It " +
    "needs no wallet: the signer's address comes from core's public " +
    "parameters. Exits 1 when the receipt is not genuine.";
  static args = {
    file: Args.string({
      description: "the receipt, as a JSON file; - reads stdin",
      required: true,
    }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %> receipt.json",
    "cat receipt.json | <%= config.bin %> <%= command.id %> - --network base --json",
  ];

  async run() {
    const { args, flags } = await this.parse(GuaranteesVerify);
    const settings = await this.settings(flags);

    let raw: unknown;
    try {
      raw = JSON.parse(await readInput(args.file));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw usageError("the receipt is not valid JSON", {
        code: "BAD_RECEIPT",
        suggestions: [
          'it should look like {"receipt": "0x…", "signature": "0x…"}',
        ],
      });
    }

    const {
      GuaranteeReceipt,
      RpcProxy,
      guaranteeRegistryDomain,
      verifyGuaranteeReceipt,
    } = await import("@4mica/sdk");
    const receipt = GuaranteeReceipt.fromRpc(raw);
    const params = await waiting(
      `Asking ${networkName(settings)} who signs its guarantees`,
      () => new RpcProxy(settings.rpcUrl.value).getPublicParams(),
    );
    if (!params.guaranteeSigner || !params.guaranteeRegistryAddress) {
      throw failure(
        `${networkName(settings)} does not publish its guarantee signer`,
        { code: "NO_GUARANTEE_SIGNER" },
      );
    }

    const guarantee = await verifyGuaranteeReceipt(
      receipt,
      guaranteeRegistryDomain(params.chainId, params.guaranteeRegistryAddress),
      params.guaranteeSigner,
    );
    const result = {
      genuine: true,
      signer: params.guaranteeSigner,
      payer: guarantee.client,
      recipient: guarantee.recipient,
      asset: guarantee.asset,
      amountRaw: guarantee.amount,
      cycleId: guarantee.cycleId,
      reqId: guarantee.reqId,
      timestamp: new Date(guarantee.timestamp * 1000),
    };
    this.log(
      fields([
        ["genuine", `yes, signed by ${result.signer}`],
        ["payer", result.payer],
        ["recipient", result.recipient],
        ["asset", result.asset],
        ["base units", result.amountRaw.toString()],
        ["signed for", result.timestamp.toISOString()],
      ]),
    );
    return result;
  }
}
