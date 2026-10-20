import type { Prisma } from "@4mica/db";

export const amountText = (value: Prisma.Decimal | number | string): string =>
  typeof value === "object" ? value.toFixed() : String(value);

export const optionalAmountText = (
  value: Prisma.Decimal | null | undefined,
): string | null => (value == null ? null : amountText(value));
