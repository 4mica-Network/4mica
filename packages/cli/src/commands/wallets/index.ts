import { BaseCommand } from "../../base.js";
import { readConfig } from "../../core/config-file.js";
import { listWallets } from "../../core/wallets.js";
import { table } from "../../ui/output.js";

export default class Wallets extends BaseCommand {
  static summary = "list the wallets this cli has created";
  static description =
    "A wallet is a private key in a file only you can read, under the cli's " +
    "config directory. The one in use is the file `key-file` points at; " +
    "`4mica whoami` shows it wherever the key comes from.";
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> create",
    "<%= config.bin %> <%= command.id %> use buyer-1",
  ];

  async run() {
    await this.parse(Wallets);
    const dir = this.config.configDir;
    const active = (await readConfig(dir))["key-file"];
    const wallets = (await listWallets(dir)).map((wallet) => ({
      ...wallet,
      active: wallet.path === active,
    }));
    this.log(
      table(
        ["NAME", "ADDRESS", "IN USE", "KEY FILE"],
        wallets.map((w) => [
          w.name,
          w.address ?? `unusable: ${w.problem}`,
          w.active ? "yes" : "-",
          w.path,
        ]),
      ),
    );
    if (wallets.some((w) => !w.address)) {
      this.note(
        "a key file that cannot be used can be deleted with `4mica wallets remove <name>`",
      );
    }
    if (wallets.length === 0) {
      this.note("no wallets yet; make one with `4mica wallets create`");
    }
    return wallets;
  }
}
