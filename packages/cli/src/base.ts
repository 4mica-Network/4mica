import { Command, Flags, type Interfaces } from "@oclif/core";
import { lastTransportFailure } from "./core/net.js";
import { setRuntimeFlags } from "./core/runtime.js";
import { errorJson, toCliError } from "./errors.js";
import { note } from "./ui/log.js";
import { toPlain } from "./ui/output.js";

/** What oclif calls `FlagOutput` and `ArgOutput`, and does not export. */
type Parsed = Record<string, unknown>;

/**
 * Every command: `--json` prints what `run()` returns, and SDK errors are
 * reported with a code and an exit status.
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
    return super.catch(toCliError(error, lastTransportFailure()) as Error);
  }

  /**
   * Progress and notes go to stderr, with or without `--json`: stdout holds
   * the result and nothing else. `--quiet` drops them.
   */
  protected note(message: string): void {
    note(message);
  }
}
