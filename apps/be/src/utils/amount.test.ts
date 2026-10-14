import { Prisma } from "@4mica/db";
import { describe, expect, it, vi } from "vitest";
import { amountText, optionalAmountText } from "./amount";
import { parseAmount } from "./customer-pricing";

vi.mock("@4mica/db", async () => {
  const runtime = await import("@prisma/client/runtime/client");

  return { Prisma: { Decimal: runtime.Decimal } };
});

describe("amountText", () => {
  it.each([
    ["0.00000001", "0.00000001"],
    ["0.000000000000000001", "0.000000000000000001"],
    ["-0.0000001", "-0.0000001"],
    ["1.500000000000000000", "1.5"],
    ["100", "100"],
    ["1e21", "1000000000000000000000"],
  ])("prints %s without exponent notation", (input, expected) => {
    expect(amountText(new Prisma.Decimal(input))).toBe(expected);
  });

  it("round-trips small Decimals through parseAmount", () => {
    expect(parseAmount(amountText(new Prisma.Decimal("0.00000001")))).toBe(
      10_000_000_000n,
    );
  });

  it("accepts number fallbacks", () => {
    expect(amountText(0)).toBe("0");
  });
});

describe("optionalAmountText", () => {
  it("keeps null as null", () => {
    expect(optionalAmountText(null)).toBeNull();
  });

  it("formats a present Decimal", () => {
    expect(optionalAmountText(new Prisma.Decimal("1e-8"))).toBe("0.00000001");
  });
});
