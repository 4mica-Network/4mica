import { isUtf8 } from "node:buffer";
import { once } from "node:events";
import { constants } from "node:fs";
import { access, type FileHandle, open, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable, type Writable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { Args, Flags } from "@oclif/core";
import { readInput } from "../core/input.js";
import { sentPayments } from "../core/outcome.js";
import { withSession } from "../core/session.js";
import { isKnownSafe, networkName } from "../core/settings.js";
import { EXIT, usageError } from "../errors.js";
import { address } from "../flags.js";
import { NetworkCommand } from "../network-command.js";
import { waiting } from "../ui/log.js";
import { printable, table } from "../ui/output.js";

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
      network: printable(String(entry.network)),
      asset: printable(String(entry.asset)),
      amountRaw: printable(String(entry.amount ?? entry.maxAmountRequired)),
      payTo: printable(String(entry.payTo)),
    }));
}

/**
 * Where the body goes, proven before anything is sent: a paid answer must
 * not be lost to a typo in a path. `-` and no `--output` mean stdout.
 */
async function outputTarget(output?: string): Promise<string | undefined> {
  if (output === undefined || output === "-") return undefined;
  const path = resolve(output);
  const existing = await stat(path).catch(() => undefined);
  if (existing?.isDirectory()) {
    throw usageError(`--output ${output} is a directory`, {
      code: "OUTPUT_NOT_WRITABLE",
      suggestions: ["name a file in it"],
    });
  }
  try {
    await access(existing ? path : dirname(path), constants.W_OK);
  } catch {
    throw usageError(
      existing
        ? `--output ${output} cannot be written`
        : `--output ${output}: the directory ${dirname(path)} does not exist or cannot be written`,
      { code: "OUTPUT_NOT_WRITABLE" },
    );
  }
  return output;
}

export default class Fetch extends NetworkCommand {
  static summary = "request a url, paying it if it asks for payment";
  static description =
    "Makes an HTTP request. If the answer is 402 with a 4mica payment " +
    "request, signs a payment within --max and repeats the request once. " +
    "The response body goes to stdout and what was paid to stderr. Core is " +
    "only contacted, and a wallet only needed, when the url asks to be paid.\n\n" +
    "It does not ask before paying: --max is the consent. On a testnet it " +
    "defaults to 1 USDC per payment. Anywhere that may be real funds " +
    "(a mainnet, or a core given by url) --max is required, or --yes to " +
    "accept that default.\n\n" +
    "--dry-run shows what a url charges and pays nothing. It still sends " +
    "the request, once and unpaid: that is how a url says what it charges. " +
    "A url that charges nothing answers it for real, and that answer is " +
    "printed.\n\n" +
    "Exits 1 when the final answer is an HTTP error. A payment that was sent " +
    "for an answer that then failed is still reported, under payment, with " +
    "settled: false: the seller holds it and may redeem it.";
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
      summary:
        "write the response body to a file instead of stdout; - is stdout",
    }),
    max: Flags.string({
      helpValue: '<"amount asset">',
      multiple: true,
      multipleNonGreedy: true,
      summary:
        'most to pay for the request, such as "0.50 USDC"; repeat per asset',
    }),
    "pay-to": address({
      multiple: true,
      multipleNonGreedy: true,
      summary: "only pay this address; repeat for more",
    }),
    yes: Flags.boolean({
      char: "y",
      summary:
        "on a network that may be real funds, pay up to 1 USDC without --max",
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
    if (
      !URL.canParse(args.url) ||
      !/^https?:$/.test(new URL(args.url).protocol)
    ) {
      throw usageError(`"${args.url}" is not an http(s) url`, {
        code: "BAD_URL",
      });
    }
    const output = await outputTarget(flags.output);
    const settings = await this.settings(flags);
    if (
      !flags["dry-run"] &&
      !isKnownSafe(settings) &&
      !flags.max &&
      !flags.yes
    ) {
      throw usageError(
        `${networkName(settings)} may be real funds: say how much this may pay`,
        {
          code: "MAX_REQUIRED",
          suggestions: [
            'pass --max, such as --max "0.50 USDC"',
            "or --yes to allow up to 1 USDC per payment",
            "or look first, paying nothing: --dry-run",
          ],
        },
      );
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

    if (flags["dry-run"] && method !== "GET" && method !== "HEAD") {
      this.warning(
        `--dry-run still sends this ${method} once, unpaid: a url that charges nothing carries it out`,
      );
    }
    // Unpaid first, without core: most urls charge nothing, and those need
    // no wallet and no sign-in.
    const first = await waiting(`Requesting ${args.url}`, () =>
      fetch(args.url, init),
    );
    const offers = first.status === 402 ? await offersIn(first.clone()) : [];

    if (flags["dry-run"]) {
      if (first.status !== 402) {
        // Not a price: the url carried the request out. Its answer is shown
        // as it would be without --dry-run, not thrown away.
        const status = first.status < 400 ? `HTTP ${first.status}: ` : "";
        this.note(
          `${status}this url did not ask for payment and answered the request itself`,
        );
        return {
          dryRun: true,
          offers: [],
          ...(await this.deliver(first, output)),
        };
      }
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
      return { dryRun: true, status: first.status, offers };
    }

    if (offers.length === 0) {
      if (first.status === 402) {
        this.note(
          "HTTP 402, but with no 4mica payment option; nothing was paid",
        );
      }
      return { ...(await this.deliver(first, output)), payment: null };
    }

    // The SDK sends the request itself and pays what it answers. It is
    // handed the 402 already in hand, so the request is not sent twice.
    let replay: Response | undefined = first;
    const replaying: typeof fetch = async (input, requestInit) => {
      const answer = replay;
      replay = undefined;
      return answer ?? fetch(input, requestInit);
    };
    return withSession(
      settings,
      async (client) => {
        const response = await waiting(`Paying ${args.url}`, () =>
          client.fetch(args.url, init),
        );
        const settled = client.paymentFor(response);
        const [sent] = sentPayments();
        if (settled) {
          this.note(
            `paid ${settled.amount} ${settled.asset.symbol} to ${settled.payTo}`,
          );
        } else if (sent) {
          // Signed and handed over, but the seller did not confirm taking
          // it: it holds the payment, and may still redeem it.
          this.warning(
            `a payment${sent.amountRaw ? ` of ${sent.amountRaw} base units` : ""}` +
              `${sent.payTo ? ` to ${sent.payTo}` : ""} was sent and not confirmed; ` +
              "the seller may still redeem it. `4mica cycles` shows what is owed.",
          );
        }
        const payment = settled
          ? { ...settled, settled: true }
          : sent
            ? { ...sent, settled: false }
            : null;
        return { ...(await this.deliver(response, output)), payment };
      },
      {
        spend: { perPayment: flags.max, payTo: flags["pay-to"] },
        fetch: replaying,
      },
    );
  }

  /**
   * The body to stdout or `--output`; exit code 1 for an HTTP error. It is
   * passed on as it arrives, so a large download takes no more memory than
   * a small one. Only `--json` to stdout reads it whole: the body is a field
   * of the document.
   */
  private async deliver(response: Response, output?: string) {
    if (response.status >= 400) {
      this.note(`HTTP ${response.status} ${response.statusText}`.trim());
      this.exitStatus(EXIT.failure);
    }
    const head = {
      status: response.status,
      headers: Object.fromEntries(response.headers),
    };
    if (output) {
      let written = output;
      let file: FileHandle;
      try {
        file = await open(output, "w");
      } catch (error) {
        // Checked before the request, so this is rare; the answer may have
        // been paid for, so it is kept somewhere rather than lost.
        written = join(tmpdir(), `4mica-fetch-${Date.now()}.out`);
        file = await open(written, "w");
        this.warning(
          `could not write ${output} (${(error as Error).message}); the body is in ${written}`,
        );
      }
      const bytes = await passOn(response, file.createWriteStream());
      if (written === output) this.note(`${bytes} bytes written to ${output}`);
      return { ...head, output: written };
    }
    if (!this.jsonEnabled()) {
      await passOn(response, process.stdout, { end: false });
      return head;
    }
    // JSON holds text. Bytes that are not text would be mangled as utf8, so
    // they go in as base64, and `bodyEncoding` says so.
    const bytes = Buffer.from(await response.arrayBuffer());
    const encoding = isUtf8(bytes) ? "utf8" : "base64";
    return {
      ...head,
      body: bytes.toString(encoding),
      bodyEncoding: encoding === "utf8" ? undefined : encoding,
    };
  }
}

/**
 * Writes a response's body to `sink` part by part, waiting when the sink is
 * full, and returns how many bytes went. A reader that has gone away
 * (`| head`) ends it quietly.
 */
async function passOn(
  response: Response,
  sink: Writable,
  options: { end?: boolean } = {},
): Promise<number> {
  let bytes = 0;
  try {
    if (response.body) {
      const body = Readable.fromWeb(response.body as ReadableStream);
      for await (const part of body as AsyncIterable<Buffer>) {
        bytes += part.byteLength;
        if (!sink.write(part)) await once(sink, "drain");
      }
    }
    if (options.end !== false) {
      sink.end();
      await once(sink, "finish");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPIPE") throw error;
  }
  return bytes;
}
