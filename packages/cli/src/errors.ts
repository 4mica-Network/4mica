import { Errors } from "@oclif/core";
import type { TransportFailure } from "./core/net.js";

/** 0 is success; parse failures get `usage` through `oclif.exitCodes`. */
export const EXIT = { failure: 1, usage: 2, config: 3 } as const;

interface ErrorOptions {
  code: string;
  suggestions?: string[];
}

export class CliError extends Errors.CLIError {
  constructor(message: string, exit: number, options: ErrorOptions) {
    super(message, { ...options, exit });
  }
}

export const failure = (message: string, options: ErrorOptions) =>
  new CliError(message, EXIT.failure, options);

export const usageError = (message: string, options: ErrorOptions) =>
  new CliError(message, EXIT.usage, options);

export const configError = (message: string, options: ErrorOptions) =>
  new CliError(message, EXIT.config, options);

/**
 * `envFile` is the .env that was read, if one was. Saying so matters: a
 * command run from the wrong directory reads that directory's .env, and "no
 * key found" alone does not show that it looked somewhere unexpected.
 */
export const noSigner = (envFile?: string) =>
  configError(
    envFile
      ? `no wallet key found; ${envFile} was read and sets none`
      : "no wallet key found, and there is no .env in this directory",
    {
      code: "NO_SIGNER",
      suggestions: [
        "make a new wallet with `4mica wallets create`",
        "or use a key you have: --key-file <path>, kept with `4mica config set key-file <path>`",
        envFile
          ? "or run from the directory whose .env has FOURMICA_WALLET_PRIVATE_KEY, or name that file with --env-file"
          : "or keep it in a .env file here, as FOURMICA_WALLET_PRIVATE_KEY",
      ],
    },
  );

const SUGGESTIONS: Record<string, string[]> = {
  AmbiguousTokenError: ["pass the token address to --asset"],
  CheckpointRequiredError: [
    "confirm the payments made so far with `4mica cycles checkpoint --asset <asset>`",
  ],
  Erc20AllowanceRequiredError: [
    "rerun with --gas self: the wallet approves the amount, then sends",
  ],
  GracePeriodNotElapsedError: [
    "run `4mica withdrawals` to see when it can be finalized",
  ],
  NoWithdrawalRequestedError: [
    "request one with `4mica withdrawals request <amount> --asset <asset>`",
  ],
  TokenNotSupportedError: ["run `4mica tokens` to list accepted tokens"],
};

/** `InsufficientBalanceError` → `INSUFFICIENT_BALANCE`. */
function codeFromName(name: string): string {
  return name
    .replace(/Error$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase();
}

function ancestry(error: Error): string[] {
  const names: string[] = [];
  for (
    let proto = Object.getPrototypeOf(error);
    proto && proto !== Error.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    names.push(proto.constructor.name);
  }
  return names;
}

/**
 * Whether `error` is the failed request, or the SDK's report of it. The SDK
 * puts the cause's message in its own; an error that does not is about
 * something else, however much it sounds like a timeout.
 */
const isAbout = (error: Error, t: TransportFailure) =>
  t.message !== "" && error.message.includes(t.message);

function transportError(t: TransportFailure): CliError {
  if (t.reason === "timeout") {
    return failure(`no response from ${t.origin} within ${t.timeoutSecs}s`, {
      code: "TIMEOUT",
      suggestions: [
        "try again, or allow longer with --request-timeout <seconds>",
      ],
    });
  }
  const why = t.detail ? ` (${t.detail})` : "";
  return failure(`could not reach ${t.origin}${why}`, {
    code: "UNREACHABLE",
    // Both are about 4mica's own services, not a url given to `fetch`.
    suggestions: t.service
      ? [
          "see which services answer with `4mica status`",
          "check the address in use with `4mica config`",
        ]
      : undefined,
  });
}

/**
 * `fetch` declined to pay. The SDK's message ends "raise the limit in
 * FourMica.connect({ spend })" whatever the reason, which is the wrong advice
 * at a terminal, and no advice at all when the seller asks for a token the
 * network does not take. Each reason gets its own code and next step.
 */
function spendLimitError(error: Error): CliError {
  const limit = (error as { limit?: string }).limit;
  const detail =
    /spend limits \(\w+\): (.*); raise the limit in FourMica\.connect/s.exec(
      error.message,
    )?.[1] ?? error.message;
  const unknownToken = /not an asset 4Mica accepts/.test(detail);
  const [code, suggestions] =
    limit === "payTo"
      ? ["PAYEE_NOT_ALLOWED", ["add the payee with --pay-to, or drop --pay-to"]]
      : limit === "assets" && unknownToken
        ? [
            "ASSET_NOT_ACCEPTED",
            [
              "the seller is asking for a token this network does not take; `4mica tokens` lists the ones it does",
              "check that you and the seller are on the same network: `4mica whoami`",
            ],
          ]
        : limit === "assets"
          ? [
              "ASSET_NOT_ALLOWED",
              ['allow paying in it with --max, such as --max "1 USDT"'],
            ]
          : [
              "OVER_SPEND_LIMIT",
              ['allow more with --max, such as --max "2 USDC"'],
            ];
  return failure(`nothing was paid: ${detail}`, { code, suggestions });
}

/**
 * The facilitator was asked to send a transaction and gave no usable answer,
 * so it may have sent it. The SDK's message quotes the timeout or dropped
 * connection behind it, which must not turn this into "try again".
 */
function outcomeUnknownError(
  error: Error,
  transport?: TransportFailure,
): CliError {
  const what = transport ? transportError(transport).message : error.message;
  return failure(`${what}; this may or may not have gone through`, {
    code: "OUTCOME_UNKNOWN",
    suggestions: [
      "do not run it again yet: a second attempt could send it twice",
      "see whether it went through with `4mica balance`, `4mica withdrawals` or `4mica cycles`",
    ],
  });
}

/**
 * Gives SDK errors a code, an exit status and a next step. Matched by class
 * name so that this module never has to load the SDK. An error that is
 * really a request nobody answered is reported as that, naming the host.
 */
export function toCliError(
  error: unknown,
  transport?: TransportFailure,
): unknown {
  if (!(error instanceof Error) || "oclif" in error) return error;
  const lineage = ancestry(error);
  const unanswered =
    transport && isAbout(error, transport) ? transport : undefined;
  if (lineage.includes("OutcomeUnknownError")) {
    return outcomeUnknownError(error, unanswered);
  }
  if (unanswered) return transportError(unanswered);
  if (!lineage.includes("FourMicaError")) return error;
  if (error.name === "SpendLimitError") return spendLimitError(error);

  const coreCode = (error as { code?: unknown }).code;
  const exit = lineage.includes("ConfigError")
    ? EXIT.config
    : lineage.includes("InvalidParamsError")
      ? EXIT.usage
      : EXIT.failure;
  return new CliError(error.message, exit, {
    code: typeof coreCode === "string" ? coreCode : codeFromName(error.name),
    suggestions: SUGGESTIONS[error.name],
  });
}

export interface ErrorJson {
  error: { code?: string; message: string; suggestions?: string[] };
}

export function errorJson(error: unknown): ErrorJson {
  if (!(error instanceof Error)) return { error: { message: String(error) } };
  const { code, suggestions } = error as Partial<Errors.CLIError>;
  return {
    error: {
      code: typeof code === "string" ? code : undefined,
      message: error.message,
      suggestions,
    },
  };
}
