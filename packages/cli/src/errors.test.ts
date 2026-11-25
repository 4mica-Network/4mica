import { describe, expect, it } from "vitest";
import { EXIT, errorJson, toCliError, usageError } from "./errors.js";

// Stand-ins with the SDK's class names: matching is by name, so that
// reporting an error never loads the SDK.
class FourMicaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
class ConfigError extends FourMicaError {}
class InvalidParamsError extends FourMicaError {}
class TokenNotSupportedError extends InvalidParamsError {}
class GracePeriodNotElapsedError extends FourMicaError {}
class RpcError extends FourMicaError {
  code = "CHECKPOINT_REQUIRED";
}

const shape = (error: unknown) => {
  const e = toCliError(error) as {
    code?: string;
    oclif?: { exit?: number };
    suggestions?: string[];
  };
  return { code: e.code, exit: e.oclif?.exit, suggestions: e.suggestions };
};

describe("toCliError", () => {
  it("derives the code from the class name", () => {
    expect(shape(new GracePeriodNotElapsedError("too early"))).toEqual({
      code: "GRACE_PERIOD_NOT_ELAPSED",
      exit: EXIT.failure,
      suggestions: [expect.stringContaining("4mica withdrawals")],
    });
  });

  it("keeps the code core attached to a refusal", () => {
    expect(shape(new RpcError("refused")).code).toBe("CHECKPOINT_REQUIRED");
  });

  it("exits 3 for configuration and 2 for bad input, including subclasses", () => {
    expect(shape(new ConfigError("bad")).exit).toBe(EXIT.config);
    expect(shape(new TokenNotSupportedError("bad")).exit).toBe(EXIT.usage);
  });

  it("leaves other errors, and errors that already have an exit code, alone", () => {
    const plain = new TypeError("fetch failed");
    expect(toCliError(plain)).toBe(plain);
    const own = usageError("bad flag", { code: "X" });
    expect(toCliError(own)).toBe(own);
  });
});

describe("a payment fetch declined to make", () => {
  class PaymentError extends FourMicaError {}
  class SpendLimitError extends PaymentError {
    constructor(
      readonly limit: string,
      detail: string,
    ) {
      super(
        `payment for http://x/premium refused by the session's spend limits (${limit}): ` +
          `${detail}; raise the limit in FourMica.connect({ spend }) to allow it`,
      );
    }
  }
  const told = (limit: string, detail: string) => {
    const e = toCliError(new SpendLimitError(limit, detail)) as {
      code: string;
      message: string;
      suggestions: string[];
    };
    return {
      code: e.code,
      message: e.message,
      advice: e.suggestions.join(" "),
    };
  };

  it("does not suggest a higher limit for a token the network does not take", () => {
    const { code, message, advice } = told(
      "assets",
      "0xba50 is not an asset 4Mica accepts on eip155:84532",
    );
    expect(code).toBe("ASSET_NOT_ACCEPTED");
    expect(message).toBe(
      "nothing was paid: 0xba50 is not an asset 4Mica accepts on eip155:84532",
    );
    expect(advice).toContain("4mica tokens");
    expect(advice).not.toContain("--max");
  });

  it("points at --max for a price over the limit, and for an unlisted asset", () => {
    expect(
      told("perPayment", "the seller asks 2 USDC, over the 1 USDC limit"),
    ).toMatchObject({ code: "OVER_SPEND_LIMIT" });
    const unlisted = told(
      "assets",
      "the seller asks for USDT, which no perPayment limit names",
    );
    expect(unlisted.code).toBe("ASSET_NOT_ALLOWED");
    expect(unlisted.advice).toContain("--max");
  });

  it("points at --pay-to for a payee that was not named", () => {
    expect(
      told("payTo", "0xabc is not in the allowed payees").advice,
    ).toContain("--pay-to");
  });
});

describe("errorJson", () => {
  it("prints the same fields the terminal shows", () => {
    expect(
      errorJson(
        usageError("no asset", { code: "NO_ASSET", suggestions: ["a"] }),
      ),
    ).toEqual({
      error: { code: "NO_ASSET", message: "no asset", suggestions: ["a"] },
    });
  });

  it("does not pass off a Node errno as an error code", () => {
    const error = Object.assign(new Error("boom"), { code: 42 });
    expect(errorJson(error).error.code).toBe("UNEXPECTED");
  });
});

describe("errors that are not the SDK's", () => {
  it("gives a parse error a code and exit 2, without the usage block", async () => {
    const { Errors } = await import("@oclif/core");
    class FlagInvalidOptionError extends Errors.CLIError {}
    const told = toCliError(
      new FlagInvalidOptionError(
        "Expected --gas=nope to be one of: auto, self\nSee more help with --help",
      ),
    ) as {
      code: string;
      oclif: { exit: number };
      message: string;
      showHelp?: boolean;
    };
    expect(told).toMatchObject({ code: "BAD_FLAG_VALUE", oclif: { exit: 2 } });
    expect(told.message).toBe("Expected --gas=nope to be one of: auto, self");
    expect(told.showHelp).toBeFalsy();
  });

  it("unwraps what oclif adds around a flag parser's own error", () => {
    const wrapped = Object.assign(
      new Error(
        "Parsing --request-timeout \n\tExpected an integer less than or equal to 2147483\nSee more help with --help",
      ),
      { oclif: { exit: 2 } },
    );
    expect(toCliError(wrapped)).toMatchObject({
      code: "BAD_FLAG_VALUE",
      message:
        "--request-timeout: Expected an integer less than or equal to 2147483",
    });
  });

  it("names the path of a file error, not Node's errno", () => {
    const missing = Object.assign(new Error("ENOENT: no such file"), {
      code: "ENOENT",
      path: "/tmp/nope/out.json",
    });
    expect(toCliError(missing)).toMatchObject({
      code: "FILE_NOT_FOUND",
      message: "there is no file or directory at /tmp/nope/out.json",
    });
  });

  it("makes Ctrl-C at a prompt a cancel, exit 130", () => {
    const aborted = Object.assign(new Error("Aborted with Ctrl+C"), {
      name: "AbortError",
      code: "ABORT_ERR",
    });
    expect(toCliError(aborted)).toMatchObject({
      code: "CANCELLED",
      oclif: { exit: EXIT.cancelled },
    });
  });

  it("says which command a child process failed in", () => {
    const failed = Object.assign(new Error("Command failed with exit code 1"), {
      name: "ExecaError",
      command: "pnpm run dev",
      exitCode: 1,
    });
    expect(toCliError(failed)).toMatchObject({
      code: "SCRIPT_FAILED",
      message: "`pnpm run dev` failed with exit code 1",
    });
  });

  it("tells a refused sign-in from a forbidden action", () => {
    const status = (n: number) =>
      Object.assign(new RpcError(`${n}: no`), { code: undefined, status: n });
    expect(shape(status(401)).code).toBe("UNAUTHENTICATED");
    expect(shape(status(403)).code).toBe("FORBIDDEN");
  });

  it("strips escape sequences a server put in its message", () => {
    const hostile = new FourMicaError(
      "\u001b[31mRED\u001b[0m \u001b]0;pwned\u0007 msg\u0000",
    );
    const { message } = toCliError(hostile) as { message: string };
    expect(message).toBe("RED  msg");
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the check
    expect(message).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
  });

  it("passes the details and retry hint through to JSON", () => {
    class CheckpointRequiredError extends RpcError {
      details = { cycleIdText: "0xtoken:100" };
    }
    const json = errorJson(toCliError(new CheckpointRequiredError("refused")));
    expect(json.error).toMatchObject({
      code: "CHECKPOINT_REQUIRED",
      details: { cycleIdText: "0xtoken:100" },
    });
  });
});

describe("once something has been sent", () => {
  it("turns a failure that proves nothing into an unknown outcome", async () => {
    const { beginSending, resetOutcome } = await import("./core/outcome.js");
    resetOutcome();
    beginSending("the deposit of 5 USDC", ["4mica balance"]);
    const told = toCliError(new Error("socket hang up")) as {
      code: string;
      message: string;
      suggestions: string[];
    };
    expect(told.code).toBe("OUTCOME_UNKNOWN");
    expect(told.message).toContain(
      "the deposit of 5 USDC may already have been sent",
    );
    expect(told.suggestions.join(" ")).toContain("`4mica balance`");
    expect(told.suggestions.join(" ")).not.toMatch(/try again/);
    // The SDK's own word on what happened stands.
    expect(shape(new GracePeriodNotElapsedError("too early")).code).toBe(
      "GRACE_PERIOD_NOT_ELAPSED",
    );
    resetOutcome();
  });

  it("never reports a timeout after a send as try again", async () => {
    const { beginSending, resetOutcome } = await import("./core/outcome.js");
    resetOutcome();
    beginSending("the payment", ["4mica cycles"]);
    const failure = {
      origin: "https://rpc.example",
      reason: "timeout" as const,
      timeoutSecs: 30,
      service: false,
      message: "The operation was aborted due to timeout",
    };
    class FourMicaContractError extends FourMicaError {}
    const told = toCliError(
      new FourMicaContractError(`deposit failed: ${failure.message}`),
      failure,
    ) as { code: string };
    expect(told.code).toBe("OUTCOME_UNKNOWN");
    resetOutcome();
  });
});
