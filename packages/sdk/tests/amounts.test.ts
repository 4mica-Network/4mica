import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatUnits,
  isNativeAsset,
  parseAmount,
  resolveToken,
  toBaseUnits,
  ZERO_ADDRESS,
} from "@/amounts";
import {
  AmbiguousTokenError,
  AmountPrecisionError,
  InvalidParamsError,
  TokenNotSupportedError,
} from "@/errors";

interface Vectors {
  toBaseUnits: {
    amount: string;
    decimals: number;
    base?: string;
    error?: string;
  }[];
  parseAmount: {
    input: string;
    amount?: string;
    asset?: string;
    error?: string;
  }[];
  formatUnits: { base: string; decimals: number; amount: string }[];
}

const vectors = JSON.parse(
  readFileSync(new URL("../amounts.vectors.json", import.meta.url), "utf8"),
) as Vectors;

const ERRORS = {
  invalid: InvalidParamsError,
  precision: AmountPrecisionError,
} as const;

const USDC = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f";
const USDT = "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a";
const TOKENS = [
  { symbol: "USDC", address: USDC, decimals: 6 },
  { symbol: "USDT", address: USDT, decimals: 6 },
];

describe("amounts.vectors.json", () => {
  for (const v of vectors.toBaseUnits) {
    it(`toBaseUnits(${JSON.stringify(v.amount)}, ${v.decimals})`, () => {
      if (v.error) {
        const error = ERRORS[v.error as keyof typeof ERRORS];
        expect(() => toBaseUnits(v.amount, v.decimals)).toThrow(error);
        if (v.error === "invalid") {
          expect(() => toBaseUnits(v.amount, v.decimals)).not.toThrow(
            AmountPrecisionError,
          );
        }
      } else {
        expect(toBaseUnits(v.amount, v.decimals)).toBe(BigInt(v.base ?? ""));
      }
    });
  }

  for (const v of vectors.parseAmount) {
    it(`parseAmount(${JSON.stringify(v.input)})`, () => {
      if (v.error) {
        expect(() => parseAmount(v.input)).toThrow(InvalidParamsError);
      } else {
        expect(parseAmount(v.input)).toEqual({
          amount: v.amount,
          asset: v.asset,
        });
      }
    });
  }

  for (const v of vectors.formatUnits) {
    it(`formatUnits(${v.base}n, ${v.decimals})`, () => {
      expect(formatUnits(BigInt(v.base), v.decimals)).toBe(v.amount);
    });
  }
});

describe("amounts", () => {
  it("accepts the structured form", () => {
    expect(parseAmount({ amount: " 5 ", asset: " USDC " })).toEqual({
      amount: "5",
      asset: "USDC",
    });
  });

  it("refuses numbers and bigints, whatever the form", () => {
    for (const bad of [
      5,
      5n,
      { amount: 5, asset: "USDC" },
      { amount: 5_000_000n, asset: "USDC" },
      { amount: "5" },
      { amount: "5", asset: "" },
      null,
    ]) {
      expect(() => parseAmount(bad as never)).toThrow(InvalidParamsError);
    }
    expect(() => toBaseUnits(5 as never, 6)).toThrow(InvalidParamsError);
  });

  it("refuses invalid decimals", () => {
    expect(() => toBaseUnits("1", -1)).toThrow(InvalidParamsError);
    expect(() => toBaseUnits("1", 1.5)).toThrow(InvalidParamsError);
    expect(() => formatUnits(1n, 256)).toThrow(InvalidParamsError);
  });

  it("round-trips format(parse(x))", () => {
    for (const [amount, decimals] of [
      ["5", 6],
      ["0.000001", 6],
      ["1234.5678", 18],
      ["0", 0],
    ] as const) {
      expect(formatUnits(toBaseUnits(amount, decimals), decimals)).toBe(amount);
    }
  });
});

describe("resolveToken", () => {
  it("matches a symbol ignoring case", () => {
    expect(resolveToken(TOKENS, "usdc")).toEqual({
      ...TOKENS[0],
      native: false,
    });
  });

  it("matches an address ignoring case", () => {
    expect(resolveToken(TOKENS, USDT.toLowerCase()).address).toBe(USDT);
  });

  it("maps the native symbol and the zero address to the native asset", () => {
    for (const input of ["ETH", "eth", ZERO_ADDRESS]) {
      expect(resolveToken(TOKENS, input)).toEqual({
        symbol: "ETH",
        address: ZERO_ADDRESS,
        decimals: 18,
        native: true,
      });
    }
    expect(resolveToken([], "POL", { nativeSymbol: "POL" }).native).toBe(true);
    expect(isNativeAsset("ETH")).toBe(true);
    expect(isNativeAsset("USDC")).toBe(false);
  });

  it("names what is accepted when the asset is not", () => {
    const err = (() => {
      try {
        resolveToken(TOKENS, "DAI", { network: "eip155:84532" });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(TokenNotSupportedError);
    expect((err as Error).message).toContain("USDC");
    expect((err as Error).message).toContain("eip155:84532");
    expect(() =>
      resolveToken(TOKENS, "0x1111111111111111111111111111111111111111"),
    ).toThrow(TokenNotSupportedError);
  });

  it("refuses to guess between two tokens with one symbol", () => {
    const tokens = [
      ...TOKENS,
      {
        symbol: "usdc",
        address: "0x2222222222222222222222222222222222222222",
        decimals: 6,
      },
    ];
    expect(() => resolveToken(tokens, "USDC")).toThrow(AmbiguousTokenError);
    expect(resolveToken(tokens, USDC).address).toBe(USDC);
  });
});
