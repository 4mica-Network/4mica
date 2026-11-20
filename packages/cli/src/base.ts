import { Command, Flags } from "@oclif/core";
import { lastTransportFailure } from "./core/net.js";
import { readRuntimeFlags } from "./core/runtime.js";
import { errorJson, toCliError } from "./errors.js";
import { note } from "./ui/log.js";
import { toPlain } from "./ui/output.js";

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
    // The color helpers and oclif each read `--no-color` from argv
    // themselves; declaring it only stops the parser from rejecting it.
    "no-color": Flags.boolean({
      helpGroup: "GLOBAL",
      summary: "plain output; NO_COLOR=1 does the same",
    }),
  };

  public override async init(): Promise<void> {
    await super.init();
    readRuntimeFlags(this.argv);
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
