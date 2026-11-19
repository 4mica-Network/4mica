// Imports nothing but the error classes: published as `@4mica/sdk/amounts`
// for code that must not bundle viem. `amounts.vectors.json` pins the rules.

import {
  AmbiguousTokenError,
  AmountPrecisionError,
  InvalidParamsError,
  TokenNotSupportedError,
} from "@/errors";

export interface AmountSpec {
  /** Decimal string in the asset's own units, e.g. `"0.10"`. */
  amount: string;
  /** Symbol, native symbol or token address. */
  asset: string;
}

/** `"5 USDC"` or `{ amount: "5", asset: "USDC" }`. */
export type AmountInput = string | AmountSpec;

export interface TokenLike {
  symbol: string;
  address: string;
  decimals: number;
}

export interface ResolvedToken extends TokenLike {
  native: boolean;
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const describe = (value: unknown): string =>
  typeof value === "bigint" ? `${value}n` : JSON.stringify(value);

/** A trimmed non-negative decimal string, or `InvalidParamsError`. */
export function parseDecimal(value: unknown): string {
  if (typeof value !== "string") {
    throw new InvalidParamsError(
      `amount must be a decimal string such as "5" or "0.10", got ` +
        `${describe(value)}; numbers and bigints are refused because base ` +
        "units and whole units would be indistinguishable",
    );
  }
  const trimmed = value.trim();
  if (!DECIMAL.test(trimmed)) {
    throw new InvalidParamsError(
      `amount must be a non-negative decimal such as "5" or "0.10", got ` +
        describe(value),
    );
  }
  return trimmed;
}

function requireDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new InvalidParamsError(`invalid token decimals: ${decimals}`);
  }
}

/** Checks the shape only; resolve the asset and decimals separately. */
export function parseAmount(input: AmountInput): AmountSpec {
  if (typeof input === "string") {
    const parts = input.trim().split(/\s+/);
    if (parts.length !== 2) {
      throw new InvalidParamsError(
        `expected an amount and its asset, such as "5 USDC", got ${describe(input)}`,
      );
    }
    return { amount: parseDecimal(parts[0]), asset: parts[1] };
  }
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.asset !== "string" ||
    input.asset.trim() === ""
  ) {
    throw new InvalidParamsError(
      `expected "5 USDC" or { amount: "5", asset: "USDC" }, got ${describe(input)}`,
    );
  }
  return {
    amount: parseDecimal(input.amount),
    asset: input.asset.trim(),
  };
}

/** Never rounds: more decimal places than `decimals` is an error. */
export function toBaseUnits(amount: string, decimals: number): bigint {
  requireDecimals(decimals);
  const value = parseDecimal(amount);
  const [, whole, rawFraction = ""] = value.match(DECIMAL) as RegExpMatchArray;
  const fraction = rawFraction.replace(/0+$/, "");
  if (fraction.length > decimals) {
    throw new AmountPrecisionError(value, decimals);
  }
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  );
}

export function formatUnits(raw: bigint, decimals: number): string {
  requireDecimals(decimals);
  if (decimals === 0) {
    return raw.toString();
  }
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function isNativeAsset(input: string, nativeSymbol = "ETH"): boolean {
  const wanted = input.trim();
  return (
    wanted.toLowerCase() === ZERO_ADDRESS ||
    wanted.toUpperCase() === nativeSymbol.toUpperCase()
  );
}

/**
 * Matches a symbol (ignoring case) or an address against core's token list;
 * the native symbol or zero address is the native asset, which core never
 * lists. Symbols come from the token contracts, so two can collide.
 */
export function resolveToken(
  tokens: readonly TokenLike[],
  input: string,
  options: { nativeSymbol?: string; network?: string } = {},
): ResolvedToken {
  const nativeSymbol = options.nativeSymbol ?? "ETH";
  const wanted = input.trim();
  if (isNativeAsset(wanted, nativeSymbol)) {
    return {
      symbol: nativeSymbol,
      address: ZERO_ADDRESS,
      decimals: 18,
      native: true,
    };
  }

  const key = ADDRESS.test(wanted) ? "address" : "symbol";
  const matches = tokens.filter(
    (t) => t[key].toLowerCase() === wanted.toLowerCase(),
  );
  if (matches.length === 0) {
    throw new TokenNotSupportedError({
      asset: wanted,
      network: options.network,
      supported: tokens,
    });
  }
  if (matches.length > 1) {
    throw new AmbiguousTokenError(wanted, matches);
  }
  const { symbol, address, decimals } = matches[0];
  return { symbol, address, decimals, native: false };
}
