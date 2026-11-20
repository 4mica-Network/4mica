import { networkName } from "../core/settings.js";
import { NetworkCommand } from "../network-command.js";
import { err, ok } from "../ui/log.js";
import { table } from "../ui/output.js";

const TIMEOUT_MS = 10_000;

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
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
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

export default class Status extends NetworkCommand {
  static summary = "check core and facilitator health";
  static description = "Exits 1 when a service does not answer.";
  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --network base --json",
  ];

  async run() {
    const { flags } = await this.parse(Status);
    const settings = await this.settings(flags);
    const facilitatorUrl = settings.facilitatorUrl?.value;

    const [core, facilitator, supported] = await Promise.all([
      probe(settings.rpcUrl.value, "core/health"),
      facilitatorUrl ? probe(facilitatorUrl, "health") : undefined,
      facilitatorUrl ? probe(facilitatorUrl, "supported") : undefined,
    ]);
    const schemes = supported?.up ? kinds(supported.body) : [];

    const state = (p: Probe) => (p.up ? ok("up") : err("down"));
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
    this.log(table(["SERVICE", "URL", "STATE", "DETAIL"], rows));

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
    };
  }
}
