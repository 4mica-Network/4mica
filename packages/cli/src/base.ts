import { Command, Flags } from "@oclif/core";
import { errorJson, toCliError } from "./errors.js";
import { toPlain } from "./ui/output.js";

/**
 * Every command: `--json` prints what `run()` returns, and SDK errors are
 * reported with a code and an exit status.
 */
export abstract class BaseCommand extends Command {
  static enableJsonFlag = true;

  static baseFlags = {
    // picocolors, ora and oclif each read `--no-color` from argv themselves;
    // declaring it only stops the parser from rejecting it.
    "no-color": Flags.boolean({
      helpGroup: "GLOBAL",
      summary: "plain output; NO_COLOR=1 does the same",
    }),
  };

  protected override toSuccessJson(result: unknown): unknown {
    return toPlain(result);
  }

  protected override toErrorJson(error: unknown): unknown {
    return errorJson(error);
  }

  protected override async catch(error: unknown): Promise<unknown> {
    return super.catch(toCliError(error) as Error);
  }

  /**
   * Progress and notes go to stderr, with or without `--json`: stdout holds
   * the result and nothing else.
   */
  protected note(message: string): void {
    process.stderr.write(`${message}\n`);
  }
}
