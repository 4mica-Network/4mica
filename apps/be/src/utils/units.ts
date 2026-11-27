import { amountText } from "@utils/amount";

const PLACES = 18;
const SCALE = 10n ** BigInt(PLACES);

export type AmountLike = Parameters<typeof amountText>[0];

export const toUnits = (value: AmountLike): bigint => {
  const text = amountText(value).trim();
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? text.slice(1) : text).split(
    ".",
  );
  const units =
    BigInt(whole === "" ? "0" : whole) * SCALE +
    BigInt(fraction.slice(0, PLACES).padEnd(PLACES, "0") || "0");
  return negative ? -units : units;
};

export const fromUnits = (units: bigint): string => {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE)
    .toString()
    .padStart(PLACES, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
};
