import { Args, Flags } from "@oclif/core";
import { ask } from "../../core/confirm.js";
import {
  listLinkedWallets,
  platformNetwork,
} from "../../core/linked-wallets.js";
import { api, requireSession } from "../../core/platform.js";
import { canPrompt } from "../../core/runtime.js";
import { walletAddress } from "../../core/session.js";
import { cancelled, failure, usageError } from "../../errors.js";
import { requireAddress } from "../../flags.js";
import { NetworkCommand } from "../../network-command.js";

export default class WalletsUnlink extends NetworkCommand {
  static summary = "remove a wallet from your 4mica account";
  static description =
    "Takes the wallet off the account: it leaves the dashboard, and any API " +
    "or agent that was paid to it is left without a wallet. The key file " +
    "and the funds are not touched, and the wallet can be linked again.\n\n" +
    "Without an address it is the wallet in use, on the network in use. An " +
    "address needs no key: a wallet whose key is gone can still be removed.";
  static args = {
    address: Args.string({
      description: "the wallet to remove; the one in use by default",
    }),
  };
  static flags = {
    yes: Flags.boolean({
      char: "y",
      summary: "remove it without asking for confirmation",
    }),
  };
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> 0x1111…1111 --network base --yes",
  ];

  async run() {
    const { args, flags } = await this.parse(WalletsUnlink);
    const settings = await this.settings(flags);
    const { platform, token } = await requireSession(this.config.configDir);
    const network = platformNetwork(settings);
    const address = args.address
      ? requireAddress(args.address, "the address")
      : await walletAddress(settings);

    const found = (
      await listLinkedWallets(platform, token, {
        address,
        network: network.name,
      })
    ).find((wallet) => wallet.address.toLowerCase() === address.toLowerCase());
    if (!found) {
      throw failure(
        `${address} is not linked to this account on ${settings.network?.value}`,
        {
          code: "WALLET_NOT_LINKED",
          suggestions: ["see what is linked with `4mica account`"],
        },
      );
    }

    if (!flags.yes) {
      if (!canPrompt()) {
        throw usageError("removing a wallet from the account needs --yes", {
          code: "CONFIRMATION_REQUIRED",
          suggestions: ["pass --yes"],
        });
      }
      const answer = await ask(
        `Remove ${found.label} (${found.address}) from the account? [y/N] `,
        { cancelMessage: "cancelled; nothing was removed" },
      );
      if (!/^y(es)?$/i.test(answer)) {
        throw cancelled("cancelled; nothing was removed");
      }
    }

    await api(platform, `/me/wallets/${encodeURIComponent(found.id)}`, {
      method: "DELETE",
      token,
    });
    this.note(
      `removed ${found.address} from the account; its key is untouched`,
    );
    return { wallet: found, unlinked: true };
  }
}
