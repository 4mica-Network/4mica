import { writeFile } from "node:fs/promises";
import { Args, Flags } from "@oclif/core";
import { readInput } from "../core/input.js";
import { withSession } from "../core/session.js";
import { networkName } from "../core/settings.js";
import { usageError } from "../errors.js";
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
    try {
      headers.append(line.slice(0, at).trim(), line.slice(at + 1).trim());
    } catch {
      throw usageError(`"${line}" is not a header http allows`, {
        code: "BAD_HEADER",
      });
    }
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
    "to 1 USDC per payment.\n\n" +
    "--dry-run shows what a url charges and pays nothing. It still sends " +
    "the request, once and unpaid: that is how a url says what it charges. " +
    "A url that charges nothing answers it for real, and that answer is " +
    "printed.\n\n" +
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
    // Not the shared flag: this dry run cannot promise that nothing is sent.
    "dry-run": Flags.boolean({
      char: "n",
      summary:
        "show what the url charges and pay nothing; the request is still sent",
    }),
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
    const method = (
      flags.method ?? (body === undefined ? "GET" : "POST")
    ).toUpperCase();
    if (body !== undefined && (method === "GET" || method === "HEAD")) {
      throw usageError(`a ${method} request cannot carry --data`, {
        code: "BODY_NOT_ALLOWED",
        suggestions: ["drop --data, or send it with -X POST"],
      });
    }
    const init: RequestInit = {
      method,
      headers: headersFrom(flags.header),
      body,
    };

    if (flags["dry-run"]) {
      const response = await waiting(`Asking ${args.url}`, () =>
        fetch(args.url, init),
      );
      if (response.status !== 402) {
        // Not a price: the url carried the request out. Its answer is shown
        // as it would be without --dry-run, not thrown away.
        const status = response.status < 400 ? `HTTP ${response.status}: ` : "";
        this.note(
          `${status}this url did not ask for payment and answered the request itself`,
        );
        return {
          dryRun: true,
          offers: [],
          ...(await this.deliver(response, flags.output)),
        };
      }
      const offers = await offersIn(response);
      this.log(
        table(
          ["NETWORK", "ASSET", "BASE UNITS", "PAY TO"],
          offers.map((o) => [o.network, o.asset, o.amountRaw, o.payTo]),
        ),
      );
      this.note(
        offers.length === 0
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
        if (payment) {
          this.note(
            `paid ${payment.amount} ${payment.asset.symbol} to ${payment.payTo}`,
          );
        }
        return {
          ...(await this.deliver(response, flags.output)),
          payment: payment ?? null,
        };
      },
      { perPayment: flags.max, payTo: flags["pay-to"] },
    );
  }

  /** The body to stdout or `--output`; exit code 1 for an HTTP error. */
  private async deliver(response: Response, output?: string) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (response.status >= 400) {
      this.note(`HTTP ${response.status} ${response.statusText}`.trim());
      process.exitCode = 1;
    }
    if (output) {
      await writeFile(output, bytes);
      this.note(`${bytes.length} bytes written to ${output}`);
    } else if (!this.jsonEnabled()) {
      process.stdout.write(bytes);
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: output ? undefined : bytes.toString("utf8"),
      output,
    };
  }
}
