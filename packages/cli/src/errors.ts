import { Errors } from "@oclif/core";
import { FUNDING_DOCS } from "./core/links.js";
import type { TransportFailure } from "./core/net.js";
import {
  anythingSent,
  broadcastLost,
  checkSuggestions,
  inFlightSummary,
} from "./core/outcome.js";
import { printable, toPlain } from "./ui/output.js";

/**
 * 0 is success. Parse failures are usage errors too; `oclif.exitCodes`
 * covers most, and `toCliError` the rest. 130 is the shell's code for an
 * interrupt (128 + SIGINT), used for every cancel.
 */
export const EXIT = {
  failure: 1,
  usage: 2,
  config: 3,
  cancelled: 130,
} as const;

interface ErrorOptions {
  code: string;
  suggestions?: string[];
  /** Whether running the same command again may succeed. */
  retryable?: boolean;
  /** Machine-readable facts behind the error, such as a cycle id. */
  details?: unknown;
}

/**
 * An error this CLI understands, with a stable code. Its text is made
 * printable here, once, because much of it comes from servers.
 */
export class CliError extends Errors.CLIError {
  readonly retryable?: boolean;
  readonly details?: unknown;

  constructor(message: string, exit: number, options: ErrorOptions) {
    const { retryable, details, ...rest } = options;
    super(printable(message), {
      ...rest,
      suggestions: rest.suggestions?.map(printable),
      exit,
    });
    this.retryable = retryable;
    this.details = details;
  }
}

export const failure = (message: string, options: ErrorOptions) =>
  new CliError(message, EXIT.failure, options);

export const usageError = (message: string, options: ErrorOptions) =>
  new CliError(message, EXIT.usage, options);

export const configError = (message: string, options: ErrorOptions) =>
  new CliError(message, EXIT.config, options);

export const cancelled = (message = "cancelled; nothing was sent") =>
  new CliError(message, EXIT.cancelled, { code: "CANCELLED" });

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
          ? "or run from the directory whose .env has FOURMICA_WALLET_PRIVATE_KEY, or name that file with --dotenv"
          : "or keep it in a .env file here, as FOURMICA_WALLET_PRIVATE_KEY",
      ],
    },
  );

const FUND = `fund the wallet first: ${FUNDING_DOCS}`;

const SUGGESTIONS: Record<string, string[]> = {
  AmbiguousTokenError: ["pass the token address to --asset"],
  CheckpointRequiredError: [
    "confirm the payments made so far with `4mica cycles checkpoint --asset <asset>`",
  ],
  Erc20AllowanceRequiredError: [
    "rerun with --gas self: the wallet approves the amount, then sends",
  ],
  GasRequiredError: [
    "send the wallet some of the network's native token for gas",
    FUND,
  ],
  GracePeriodNotElapsedError: [
    "run `4mica withdrawals` to see when it can be finalized",
  ],
  InsufficientAvailableError: [
    "see what is available with `4mica balance`",
    "deposit more with `4mica deposit <amount> --asset <asset>`",
  ],
  InsufficientBalanceError: [
    "see what the wallet holds with `4mica balance`",
    FUND,
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

const nonEmpty = (list: string[]) => (list.length > 0 ? list : undefined);

/** Read requests are safe to repeat, so these two say so. */
function transportError(t: TransportFailure): CliError {
  const proxy =
    process.env.HTTPS_PROXY || process.env.HTTP_PROXY
      ? [
          "a proxy is set in the environment; check that it reaches this host, or exempt it with NO_PROXY",
        ]
      : [];
  if (t.reason === "timeout") {
    return failure(`no response from ${t.origin} within ${t.timeoutSecs}s`, {
      code: "TIMEOUT",
      retryable: true,
      suggestions: [
        "try again, or allow longer with --request-timeout <seconds>",
        ...proxy,
      ],
    });
  }
  const why = t.detail ? ` (${t.detail})` : "";
  return failure(`could not reach ${t.origin}${why}`, {
    code: "UNREACHABLE",
    retryable: true,
    // Both are about 4mica's own services, not a url given to `fetch`.
    suggestions: nonEmpty([
      ...(t.service
        ? [
            "see which services answer with `4mica status`",
            "check the address in use with `4mica config`",
          ]
        : []),
      ...proxy,
    ]),
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
  return failure(`nothing was paid: ${detail}`, {
    code,
    suggestions,
    retryable: false,
  });
}

/**
 * Something may have gone out and no usable answer came back, so it may
 * have gone through. The message quotes the timeout or dropped connection
 * behind it, which must not turn this into "try again".
 */
function outcomeUnknownError(
  error: Error,
  transport?: TransportFailure,
): CliError {
  const what = transport ? transportError(transport).message : error.message;
  const sent = inFlightSummary();
  return failure(
    `${what}; this may or may not have gone through${sent ? ` (${sent})` : ""}`,
    {
      code: "OUTCOME_UNKNOWN",
      retryable: false,
      suggestions: checkSuggestions(),
    },
  );
}

/** oclif's parse errors, by class name: what the user typed wrong. */
const PARSE_CODES: Record<string, string> = {
  ArgInvalidOptionError: "BAD_ARG_VALUE",
  FailedFlagValidationError: "FLAG_CONFLICT",
  FlagInvalidOptionError: "BAD_FLAG_VALUE",
  NonExistentFlagsError: "UNKNOWN_FLAG",
  RequiredArgsError: "MISSING_ARG",
  UnexpectedArgsError: "UNEXPECTED_ARG",
  ViolatedFlagConstraintError: "FLAG_CONFLICT",
};

/**
 * An oclif parse error, or a flag value its parser refused (`--gas nope`,
 * `--request-timeout 0`): exit 2 with a code, and without the full usage
 * block after it, which pushes the error itself off a small screen.
 */
function parseError(error: Error): CliError | undefined {
  const name = ancestry(error).find((n) => n in PARSE_CODES);
  const flagValue = FLAG_PARSE.exec(error.message);
  if (!name && !("parse" in error) && !flagValue) return undefined;
  // Until 0.3 the flag was `--env-file`, which Node reads for itself.
  const renamed =
    name === "NonExistentFlagsError" && error.message.includes("--env-file");
  return usageError(cleanParseMessage(error.message), {
    code: name ? PARSE_CODES[name] : flagValue ? "BAD_FLAG_VALUE" : "USAGE",
    suggestions: [
      renamed
        ? "the flag is --dotenv <path>; Node takes --env-file for itself"
        : "see the command's flags and examples with --help",
    ],
  });
}

/** How oclif wraps an error thrown by a flag's own parser. */
const FLAG_PARSE =
  /^Parsing --([\w-]+) \n\t([\s\S]*?)(\nSee more help with --help)?$/;

/** `--pay-to: "x" is not an address`, without oclif's wrapping. */
function cleanParseMessage(message: string): string {
  const wrapped = FLAG_PARSE.exec(message);
  const plain = wrapped ? `--${wrapped[1]}: ${wrapped[2]}` : message;
  return plain.replace(/\n\s*See more help with --help$/, "");
}

/** Node's own errors about files, by errno. */
const FILE_ERRORS: Record<string, [string, (path: string) => string]> = {
  EACCES: ["NO_PERMISSION", (p) => `no permission to use ${p}`],
  EEXIST: ["FILE_EXISTS", (p) => `${p} already exists`],
  EISDIR: ["IS_A_DIRECTORY", (p) => `${p} is a directory`],
  ENOENT: ["FILE_NOT_FOUND", (p) => `there is no file or directory at ${p}`],
  ENOSPC: ["DISK_FULL", (p) => `no space left to write ${p}`],
  ENOTDIR: ["NOT_A_DIRECTORY", (p) => `part of ${p} is not a directory`],
  EPERM: ["NO_PERMISSION", (p) => `not permitted to use ${p}`],
  EROFS: ["READ_ONLY", (p) => `${p} is on a read-only file system`],
};

/** Errors from Node and the libraries the CLI uses, not from the SDK. */
function systemError(error: Error): CliError | undefined {
  const { code, path } = error as NodeJS.ErrnoException;
  if (error.name === "AbortError" || code === "ABORT_ERR") return cancelled();
  if (
    typeof code === "string" &&
    typeof path === "string" &&
    code in FILE_ERRORS
  ) {
    const [mapped, say] = FILE_ERRORS[code];
    return failure(say(path), { code: mapped });
  }
  if (error.name === "ExecaError") {
    const e = error as Error & {
      command?: string;
      exitCode?: number;
      signal?: string;
      code?: string;
    };
    if (e.signal === "SIGINT") return cancelled("stopped");
    if (e.code === "ENOENT") {
      return failure(
        `${e.command?.split(" ")[0] ?? "the program"} is not installed`,
        {
          code: "COMMAND_NOT_FOUND",
        },
      );
    }
    return failure(
      `\`${e.command ?? "a command"}\` failed${e.exitCode === undefined ? "" : ` with exit code ${e.exitCode}`}`,
      { code: "SCRIPT_FAILED" },
    );
  }
  return undefined;
}

/** A 401 or 403 that core gave no code of its own. */
function authStatus(status: unknown): CliError | undefined {
  if (status === 401) {
    return failure("core did not accept this wallet's sign-in", {
      code: "UNAUTHENTICATED",
      suggestions: [
        "check that the key, network and core url belong together: `4mica whoami`",
      ],
    });
  }
  if (status === 403) {
    return failure("core does not allow this wallet to do that", {
      code: "FORBIDDEN",
      suggestions: ["check which wallet is in use with `4mica whoami`"],
    });
  }
  return undefined;
}

/**
 * Gives errors a code, an exit status and a next step: SDK errors matched by
 * class name (so this module never has to load the SDK), oclif's parse
 * errors, and Node's. An error that is really a request nobody answered is
 * reported as that, naming the host. Once anything has been sent, a failure
 * that does not prove nothing landed is an unknown outcome, never "try
 * again".
 *
 * Anything else is returned as it is: a bug, which `BaseCommand` reports as
 * one.
 */
export function toCliError(
  error: unknown,
  transport?: TransportFailure,
): unknown {
  if (!(error instanceof Error)) return error;
  if (error instanceof CliError) {
    // A flag parser of ours threw it, and oclif wrapped its message.
    if (FLAG_PARSE.test(error.message)) {
      error.message = cleanParseMessage(error.message);
    }
    return error;
  }
  if (error instanceof Errors.CLIError || "oclif" in error) {
    return parseError(error) ?? error;
  }
  const lineage = ancestry(error);
  const unanswered =
    transport && isAbout(error, transport) ? transport : undefined;
  if (lineage.includes("OutcomeUnknownError")) {
    return outcomeUnknownError(error, unanswered);
  }
  const sdk = lineage.includes("FourMicaError");
  if (anythingSent()) {
    // A transaction was handed to the node and its answer never came. The
    // SDK reports that as an ordinary failed write ("deposit failed: the
    // request took too long"), which reads as "nothing happened".
    if (broadcastLost()) return outcomeUnknownError(error, unanswered);
    const system = systemError(error);
    if (system?.code === "CANCELLED") return outcomeUnknownError(error);
    // A request that got no answer after something left, or an error from
    // below the SDK (viem's receipt wait timing out, say): either way the
    // transaction may be out. The SDK's own typed errors, such as a revert,
    // say what happened, and stay definite.
    if (unanswered || (!sdk && !system)) {
      return outcomeUnknownError(error, unanswered);
    }
  }
  if (unanswered) return transportError(unanswered);
  if (!sdk) return systemError(error) ?? error;
  if (error.name === "SpendLimitError") return spendLimitError(error);

  const {
    code: coreCode,
    status,
    details,
    retryable,
  } = error as {
    code?: unknown;
    status?: unknown;
    details?: unknown;
    retryable?: unknown;
  };
  if (coreCode === undefined || coreCode === "RPC") {
    const auth = authStatus(status);
    if (auth) return auth;
  }
  const exit = lineage.includes("ConfigError")
    ? EXIT.config
    : lineage.includes("InvalidParamsError")
      ? EXIT.usage
      : EXIT.failure;
  const code =
    typeof coreCode === "string" ? coreCode : codeFromName(error.name);
  return new CliError(error.message, exit, {
    code,
    suggestions:
      SUGGESTIONS[error.name] ??
      // Core answered, with an error it gave no code of its own.
      (code === "RPC"
        ? ["see which services answer with `4mica status`"]
        : undefined),
    retryable: typeof retryable === "boolean" ? retryable : undefined,
    details,
  });
}

export interface ErrorJson {
  error: {
    code: string;
    message: string;
    suggestions?: string[];
    retryable?: boolean;
    details?: unknown;
  };
}

/** One shape for every failure, whatever threw it. */
export function errorJson(error: unknown): ErrorJson {
  if (!(error instanceof Error)) {
    return { error: { code: "UNEXPECTED", message: printable(String(error)) } };
  }
  const { code, suggestions, retryable, details } = error as Partial<CliError>;
  return {
    error: {
      code: typeof code === "string" ? code : "UNEXPECTED",
      message: printable(error.message),
      suggestions: suggestions?.length ? suggestions : undefined,
      retryable,
      details: details === undefined ? undefined : toPlain(details),
    },
  };
}
