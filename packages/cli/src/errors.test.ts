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
    expect(errorJson(error).error.code).toBeUndefined();
  });
});
