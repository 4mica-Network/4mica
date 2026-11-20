import { listAssets } from "../core/assets.js";
import { connect } from "../core/session.js";
import { networkName, type Settings } from "../core/settings.js";
import { NetworkCommand } from "../network-command.js";
import { out, waiting } from "../ui/log.js";
import { table } from "../ui/output.js";

interface Probe {
  url: string;
  up: boolean;
  /** HTTP status, or why there was no response. */
  detail: string;
  body?: unknown;
}

async function probe(base: string, path: string): Promise<Probe> {
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`).href;
  try {
    // Timed out by --request-timeout, like every other request.
    const response = await fetch(url);
    const body: unknown = await response.json().catch(() => undefined);
    return { url, up: response.ok, detail: `HTTP ${response.status}`, body };
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    return { url, up: false, detail: cause ?? (error as Error).name };
  }
}

/** `4mica-credit on eip155:84532`, from an x402 `/supported` response. */
function kinds(body: unknown): string[] {
  const list = (body as { kinds?: unknown })?.kinds;
  if (!Array.isArray(list)) return [];
  return [
    ...new Set(
      list.flatMap((kind: { scheme?: unknown; network?: unknown }) =>
        typeof kind?.scheme === "string" && typeof kind.network === "string"
          ? [`${kind.scheme} on ${kind.network}`]
          : [],
      ),
    ),
  ];
}

interface Readiness {
  address: string;
  /** What the wallet itself holds, such as "10 USDC". */
  holds: string[];
  /** Collateral available to spend. */
  collateral: string[];
}

/**
 * Whether the wallet in use could pay: does it hold anything, and has any of
 * it been deposited. Read from the chain and from core.
 */
async function readiness(settings: Settings): Promise<Readiness> {
  const { formatUnits } = await import("@4mica/sdk/amounts");
  const client = await connect(settings);
  try {
    const gateway = await (await client.lowLevel()).ctx.gateway();
    const holds: string[] = [];
    for (const token of await listAssets(settings, client)) {
      const raw = token.native
        ? await gateway.nativeBalance()
        : await gateway.erc20Balance(token.address);
      if (raw > 0n)
        holds.push(`${formatUnits(raw, token.decimals)} ${token.symbol}`);
    }
    const collateral = Object.values(await client.balance())
      .filter((b) => b.raw.available > 0n)
      .map((b) => `${b.available} ${b.asset.symbol}`);
    return { address: client.address, holds, collateral };
  } finally {
    await client.close();
  }
}

export default class Status extends NetworkCommand {
  static summary = "check core and facilitator health";
  static description =
    "Exits 1 when a service does not answer. With a wallet in use it also " +
    "says whether the wallet is funded and has collateral; neither changes " +
    "the exit code.";
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --network base --json",
  ];

  async run() {
    const { flags } = await this.parse(Status);
    const settings = await this.settings(flags);
    const facilitatorUrl = settings.facilitatorUrl?.value;

    const [core, facilitator, supported] = await waiting(
      `Checking ${networkName(settings)}`,
      () =>
        Promise.all([
          probe(settings.rpcUrl.value, "core/health"),
          facilitatorUrl ? probe(facilitatorUrl, "health") : undefined,
          facilitatorUrl ? probe(facilitatorUrl, "supported") : undefined,
        ]),
    );
    const schemes = supported?.up ? kinds(supported.body) : [];

    const state = (p: Probe) => (p.up ? out.green("up") : out.red("down"));
    const rows = [["core", settings.rpcUrl.value, state(core), core.detail]];
    rows.push(
      facilitator
        ? [
            "facilitator",
            facilitatorUrl as string,
            state(facilitator),
            facilitator.up ? schemes.join(", ") : facilitator.detail,
          ]
        : ["facilitator", "-", "none", "not hosted on this network"],
    );

    // A wallet that cannot be read is reported, not fatal: this command is
    // about the services.
    let wallet: Readiness | { error: string } | undefined;
    if (settings.key && core.up) {
      wallet = await waiting("Checking the wallet", () =>
        readiness(settings).catch((error: Error) => ({ error: error.message })),
      );
      if ("error" in wallet) {
        rows.push(["wallet", "-", out.red("unknown"), wallet.error]);
      } else {
        const none = out.dim("none");
        rows.push(
          [
            "wallet",
            wallet.address,
            wallet.holds.length > 0 ? out.green("funded") : "empty",
            wallet.holds.join(", ") || none,
          ],
          [
            "collateral",
            wallet.address,
            wallet.collateral.length > 0 ? out.green("ready") : "none",
            wallet.collateral.join(", ") ||
              "deposit with `4mica deposit <amount> --asset <asset>`",
          ],
        );
      }
    }
    this.log(table(["CHECK", "WHERE", "STATE", "DETAIL"], rows));

    if (!core.up || facilitator?.up === false) process.exitCode = 1;
    return {
      network: networkName(settings),
      core: { url: settings.rpcUrl.value, up: core.up, detail: core.detail },
      facilitator: facilitator && {
        url: facilitatorUrl,
        up: facilitator.up,
        detail: facilitator.detail,
        schemes,
      },
      wallet,
    };
  }
}
