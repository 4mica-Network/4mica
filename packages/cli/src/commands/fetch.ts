import { writeFile } from "node:fs/promises";
import { Args, Flags } from "@oclif/core";
import { readInput } from "../core/input.js";
import { withSession } from "../core/session.js";
import { networkName } from "../core/settings.js";
import { usageError } from "../errors.js";
import { dryRun } from "../flags.js";
import { NetworkCommand } from "../network-command.js";
import { waiting } from "../ui/log.js";
import { table } from "../ui/output.js";

const SCHEME = "4mica-credit";

function headersFrom(lines: string[] = []): Headers {
  const headers = new Headers();
  for (const line of lines) {
    const at = line.indexOf(":");
    if (at < 1) {
      throw usageError(`"${line}" is not a header`, {
        code: "BAD_HEADER",
        suggestions: ['write it as "name: value"'],
      });
    }
    headers.append(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  return headers;
}

/** curl's forms: a literal, `@file`, or `@-` (also plain `-`) for stdin. */
async function bodyFrom(data?: string): Promise<string | undefined> {
  if (data === undefined) return undefined;
  if (data === "-") return readInput("-");
  return data.startsWith("@") ? readInput(data.slice(1)) : data;
}

interface Offer {
  network: string;
  asset: string;
  amountRaw: string;
  payTo: string;
}

/** What a 402 asks for in 4mica credit: in a header (x402 v2) or the body. */
async function offersIn(response: Response): Promise<Offer[]> {
  const header = response.headers.get("PAYMENT-REQUIRED");
  let required: { accepts?: unknown };
  try {
    required = JSON.parse(
      header
        ? Buffer.from(header.trim(), "base64").toString("utf8")
        : await response.text(),
    );
  } catch {
    return [];
  }
  if (!Array.isArray(required?.accepts)) return [];
  return required.accepts
    .filter((entry) => entry?.scheme === SCHEME)
    .map((entry) => ({
      network: String(entry.network),
      asset: String(entry.asset),
      amountRaw: String(entry.amount ?? entry.maxAmountRequired),
      payTo: String(entry.payTo),
    }));
}

export default class Fetch extends NetworkCommand {
  static summary = "request a url, paying it if it asks for payment";
  static description =
    "Makes an HTTP request. If the answer is 402 with a 4mica payment " +
    "request, signs a payment within --max and repeats the request once. " +
    "The response body goes to stdout and what was paid to stderr.\n\n" +
    "It does not ask before paying: --max is the consent, and it defaults " +
    "to 1 USDC per payment. Use --dry-run to see what a url charges.\n\n" +
    "Exits 1 when the final answer is an HTTP error.";
  static args = {
    url: Args.string({ description: "the url to request", required: true }),
  };
  static flags = {
    method: Flags.string({
      char: "X",
      helpValue: "<method>",
      summary: "http method; POST when --data is given, else GET",
    }),
    header: Flags.string({
      char: "H",
      helpValue: '<"name: value">',
      multiple: true,
      multipleNonGreedy: true,
      summary: "a request header; repeat for more",
    }),
    data: Flags.string({
      char: "d",
      helpValue: "<data|@file|->",
      summary: "request body: a literal, @file, or - for stdin",
    }),
    output: Flags.string({
      char: "o",
      helpValue: "<file>",
      summary: "write the response body to a file instead of stdout",
    }),
    max: Flags.string({
      helpValue: '<"amount asset">',
      multiple: true,
      multipleNonGreedy: true,
      summary:
        'most to pay for the request, such as "0.50 USDC"; repeat per asset',
    }),
    "pay-to": Flags.string({
      helpValue: "<address>",
      multiple: true,
      multipleNonGreedy: true,
      summary: "only pay this address; repeat for more",
    }),
    "dry-run": dryRun,
  };
  static examples = [
    "<%= config.bin %> <%= command.id %> https://api.example.com/report",
    "<%= config.bin %> <%= command.id %> https://api.example.com/report --dry-run",
    '<%= config.bin %> <%= command.id %> https://api.example.com/run -d @body.json -H "content-type: application/json" --max "0.50 USDC"',
  ];

  async run() {
    const { args, flags } = await this.parse(Fetch);
    const settings = await this.settings(flags);
    if (!URL.canParse(args.url)) {
      throw usageError(`"${args.url}" is not a url`, { code: "BAD_URL" });
    }
    const body = await bodyFrom(flags.data);
    const init: RequestInit = {
      method: flags.method ?? (body === undefined ? "GET" : "POST"),
      headers: headersFrom(flags.header),
      body,
    };

    if (flags["dry-run"]) {
      const response = await waiting(`Asking ${args.url}`, () =>
        fetch(args.url, init),
      );
      const offers = response.status === 402 ? await offersIn(response) : [];
      this.log(
        table(
          ["NETWORK", "ASSET", "BASE UNITS", "PAY TO"],
          offers.map((o) => [o.network, o.asset, o.amountRaw, o.payTo]),
        ),
      );
      this.note(
        response.status !== 402
          ? `HTTP ${response.status}: this url does not ask for payment`
          : offers.length === 0
            ? "HTTP 402, but with no 4mica payment option"
            : `HTTP 402: nothing was paid. You are on ${networkName(settings)}.`,
      );
      return { dryRun: true, status: response.status, offers };
    }

    return withSession(
      settings,
      async (client) => {
        const response = await waiting(`Requesting ${args.url}`, () =>
          client.fetch(args.url, init),
        );
        const payment = client.paymentFor(response);
        const bytes = Buffer.from(await response.arrayBuffer());

        if (payment) {
          this.note(
            `paid ${payment.amount} ${payment.asset.symbol} to ${payment.payTo}`,
          );
        }
        if (response.status >= 400) {
          this.note(`HTTP ${response.status} ${response.statusText}`.trim());
          process.exitCode = 1;
        }

        if (flags.output) {
          await writeFile(flags.output, bytes);
          this.note(`${bytes.length} bytes written to ${flags.output}`);
        } else if (!this.jsonEnabled()) {
          process.stdout.write(bytes);
        }
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: flags.output ? undefined : bytes.toString("utf8"),
          output: flags.output,
          payment: payment ?? null,
        };
      },
      { perPayment: flags.max, payTo: flags["pay-to"] },
    );
  }
}
