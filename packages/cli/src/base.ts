import { Command, Flags, type Interfaces } from "@oclif/core";
import { lastTransportFailure } from "./core/net.js";
import { checkSuggestions, inFlightSummary } from "./core/outcome.js";
import { runtime, setRuntimeFlags } from "./core/runtime.js";
import { CliError, EXIT, errorJson, failure, toCliError } from "./errors.js";
import { debug, note, warning } from "./ui/log.js";
import { toPlain } from "./ui/output.js";

/** What oclif calls `FlagOutput` and `ArgOutput`, and does not export. */
type Parsed = Record<string, unknown>;

/** The one interrupt handler, installed by the first command to start. */
let interruptInstalled = false;

/**
 * Ctrl-C: one line and exit 130, wherever it lands. If something may
 * already have left (a transaction broadcast, a payment handed over), the
 * line says what and how to check, because the send cannot be called back.
 */
export function onInterrupt(json: boolean): void {
  // A child process (`dev`) has the terminal; Ctrl-C is for it, and this
  // process ends when it does.
  if (runtime.childInForeground) return;
  const sent = inFlightSummary();
  const message = sent
    ? `interrupted: ${sent}; it may still go through`
    : "cancelled; nothing was sent";
  // Even with --quiet: this is the outcome, not progress.
  process.stderr.write(`\n${message}\n`);
  if (sent) {
    for (const line of checkSuggestions()) process.stderr.write(`  ${line}\n`);
  }
  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          error: {
            code: sent ? "OUTCOME_UNKNOWN" : "CANCELLED",
            message,
            retryable: false,
          },
        },
        null,
        2,
      )}\n`,
    );
  }
  process.exit(EXIT.cancelled);
}

/**
 * Every command: `--json` prints what `run()` returns, errors are reported
 * with a code and an exit status, and Ctrl-C ends it the same way
 * everywhere.
 */
export abstract class BaseCommand extends Command {
  static enableJsonFlag = true;

  static baseFlags = {
    quiet: Flags.boolean({
      char: "q",
      helpGroup: "GLOBAL",
      summary: "print the result and errors only, no progress",
    }),
    "no-input": Flags.boolean({
      helpGroup: "GLOBAL",
      summary: "never ask a question; fail if one is needed",
    }),
    debug: Flags.boolean({
      aliases: ["verbose"],
      helpGroup: "GLOBAL",
      summary:
        "print each request and the stack of a failure to stderr; DEBUG=4mica does the same",
    }),
    // The color helpers and oclif each read these two from argv themselves;
    // declaring them only stops the parser from rejecting them.
    "no-color": Flags.boolean({
      helpGroup: "GLOBAL",
      summary: "plain output; NO_COLOR=1 does the same",
    }),
    color: Flags.boolean({
      helpGroup: "GLOBAL",
      summary: "color even when piped; FORCE_COLOR=1 does the same",
    }),
  };

  override async init(): Promise<void> {
    await super.init();
    if (!interruptInstalled) {
      interruptInstalled = true;
      process.on("SIGINT", () => onInterrupt(this.jsonEnabled()));
    }
  }

  /** Parses as oclif does, and keeps `--quiet` and `--no-input` for helpers. */
  protected override async parse<
    F extends Parsed,
    B extends Parsed,
    A extends Parsed,
  >(
    options?: Interfaces.Input<F, B, A>,
    argv?: string[],
  ): Promise<Interfaces.ParserOutput<F, B, A>> {
    const parsed = await super.parse(options, argv);
    setRuntimeFlags(parsed.flags);
    return parsed;
  }

  protected override toSuccessJson(result: unknown): unknown {
    return toPlain(result);
  }

  protected override toErrorJson(error: unknown): unknown {
    return errorJson(error);
  }

  protected override async catch(error: unknown): Promise<unknown> {
    const mapped = toCliError(error, lastTransportFailure());
    if (runtime.debug && error instanceof Error && error.stack) {
      debug(error.stack);
      if (error.cause) debug(`cause: ${String(error.cause)}`);
    }
    return super.catch(
      mapped instanceof CliError || isOclifError(mapped)
        ? (mapped as Error)
        : this.unexpected(mapped),
    );
  }

  /**
   * An error nothing recognised is a bug: say so, and where to report it.
   * The link carries the version, platform and command, never argv, which
   * can hold paths and urls with tokens in them.
   */
  private unexpected(error: unknown): CliError {
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    const { bugs } = this.config.pjson;
    const issues = typeof bugs === "string" ? bugs : bugs?.url;
    const body = [
      `version: ${this.config.userAgent}`,
      `command: ${this.id ?? "(none)"}`,
      `error: ${name}`,
    ].join("\n");
    const link =
      issues &&
      `${issues}/new?title=${encodeURIComponent(`${this.id ?? "cli"}: ${name}`)}&body=${encodeURIComponent(body)}`;
    return failure(`${name}: ${message}`, {
      code: "UNEXPECTED",
      suggestions: [
        ...(runtime.debug ? [] : ["rerun with --debug to see where it failed"]),
        ...(link ? [`this looks like a bug; please report it: ${link}`] : []),
      ],
    });
  }

  /**
   * For a command that has a result to print and still did not succeed: a
   * dry run that found a problem, a service that is down, an HTTP error. The
   * one place the exit status is set without an error being thrown.
   */
  protected exitStatus(code: number): void {
    process.exitCode = code;
  }

  /**
   * Progress and notes go to stderr, with or without `--json`: stdout holds
   * the result and nothing else. `--quiet` drops them.
   */
  protected note(message: string): void {
    note(message);
  }

  /** Like `note`, but `--quiet` does not hide it. */
  protected warning(message: string): void {
    warning(message);
  }
}

/** oclif's own exits (`--help`, `--version`) are not failures to report. */
const isOclifError = (error: unknown): boolean =>
  error instanceof Error &&
  ("oclif" in error || (error as { code?: unknown }).code === "EEXIT");
