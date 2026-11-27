import { basename } from "node:path";
import { Flags } from "@oclif/core";
import {
  assertLinkChallenge,
  type LinkedWallet,
  platformNetwork,
} from "../../core/linked-wallets.js";
import {
  accountLabel,
  api,
  apiError,
  request,
  requireSession,
  whoAmI,
} from "../../core/platform.js";
import { walletAddress, walletKey } from "../../core/session.js";
import { walletsDir } from "../../core/wallets.js";
import { failure } from "../../errors.js";
import { NetworkCommand } from "../../network-command.js";
import { fields } from "../../ui/output.js";

interface Challenge {
  nonce: string;
  message: string;
  expiresAt: string;
}

export default class WalletsLink extends NetworkCommand {
  static summary = "link the wallet in use to your 4mica account";
  static description =
    "Proves to the platform that you hold the wallet's key, by signing a " +
    "one-time message with it, so the wallet shows in the dashboard and can " +
    "be chosen for an API or an agent. The message is plain text that says " +
    "what it is for; signing it sends no transaction and authorizes no " +
    "transfer. The key never leaves this machine.\n\n" +
    "Needs `4mica auth login` first. The wallet is the one `4mica whoami` " +
    "shows, on the network in use.";
  static flags = {
    label: Flags.string({
      helpValue: "<text>",
      summary: "what the dashboard calls it; the wallet's name by default",
    }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --network base --label Treasury",
  ];

  async run() {
    const { flags } = await this.parse(WalletsLink);
    const settings = await this.settings(flags);
    const { platform, token } = await requireSession(this.config.configDir);
    const address = await walletAddress(settings);
    const network = platformNetwork(settings);

    const file = settings.key?.file;
    const label =
      flags.label ??
      (file?.startsWith(walletsDir(this.config.configDir))
        ? basename(file, ".key")
        : "CLI wallet");

    const me = await whoAmI(platform, token);
    const challenge = await api<Challenge>(platform, "/me/wallets/siwe-nonce", {
      method: "POST",
      token,
      body: { address, network: network.name },
    });
    assertLinkChallenge(challenge.message, {
      address,
      chainId: network.chainId,
      nonce: challenge.nonce,
      userId: me.user.id,
    });

    const key = walletKey(settings);
    const { privateKeyToAccount } = await import("viem/accounts");
    const signature = await privateKeyToAccount(
      (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`,
    ).signMessage({ message: challenge.message });

    const response = await request(platform, "/me/wallets", {
      method: "POST",
      token,
      body: {
        label,
        address,
        network: network.name,
        nonce: challenge.nonce,
        signature,
      },
    });
    if (response.status === 409) {
      throw failure(
        `${address} is already linked to ${accountLabel(me.user)} on ${settings.network?.value}`,
        { code: "WALLET_ALREADY_LINKED" },
      );
    }
    if (response.status !== 201) throw apiError(platform, response);
    const wallet = response.body as LinkedWallet;

    this.note(`linked to ${accountLabel(me.user)}`);
    this.log(
      fields([
        ["address", wallet.address],
        ["network", settings.network?.value],
        ["label", wallet.label],
        ["account", accountLabel(me.user)],
      ]),
    );
    return { wallet, account: me.user };
  }
}
