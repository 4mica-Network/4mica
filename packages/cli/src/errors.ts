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

export const noSigner = () =>
  configError("no wallet key found", {
    code: "NO_SIGNER",
    suggestions: [
      "make a new wallet with `4mica wallets create`",
      "or use a key you have: --key-file <path>, kept with `4mica config set key-file <path>`",
      "or keep it in a .env file here, as FOURMICA_WALLET_PRIVATE_KEY",
    ],
  });

const SUGGESTIONS: Record<string, string[]> = {
  AmbiguousTokenError: ["pass the token address to --asset"],
  CheckpointRequiredError: [
    "confirm the payments made so far with `4mica cycles checkpoint --asset <asset>`",
  ],
  Erc20AllowanceRequiredError: [
    "rerun with --gas self: the wallet approves the amount, then sends",
  ],
  SpendLimitError: [
    'allow more per payment with --max, such as --max "2 USDC"',
    "or check who is being paid: --pay-to limits it to addresses you name",
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

/** How a request that got no response shows up in an error message. */
const TRANSPORT = /fetch failed|TimeoutError|timed out|aborted/i;

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
    suggestions: [
      "see which services answer with `4mica status`",
      "check the address in use with `4mica config`",
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
  if (transport && TRANSPORT.test(`${error.name}: ${error.message}`)) {
    return transportError(transport);
  }
  const lineage = ancestry(error);
  if (!lineage.includes("FourMicaError")) return error;

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
