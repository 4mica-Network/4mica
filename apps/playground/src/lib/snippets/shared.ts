/**
 * Shared helpers for turning DB rows into snippet source text.
 *
 * Everything here is pure so the builders can be asserted in unit tests — the
 * thing worth testing is that a listing's real values reach the code a customer
 * copies, and that a missing value degrades to a marked placeholder rather than
 * the string "undefined".
 */

/** Stand-ins, all obviously not-real so nobody pastes one into production. */
export const PLACEHOLDER = {
  baseUrl: "https://api.example.com",
  agentWallet: "0xYourAgentWallet",
} as const;

/** `https://api.x.io/` + `/v1/limits` -> `https://api.x.io/v1/limits`. */
export const joinUrl = (baseUrl: string, path: string): string => {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.replace(/^\/+/, "");

  return suffix ? `${base}/${suffix}` : base;
};

/**
 * Decimal(38,18) round-trips through Prisma as a string that may carry trailing
 * zeros ("0.010000000000000000"). Show what a human would write.
 */
export const trimAmount = (amount: string): string => {
  if (!amount.includes(".")) {
    return amount;
  }

  const trimmed = amount.replace(/0+$/, "").replace(/\.$/, "");

  return trimmed === "" || trimmed === "-" ? "0" : trimmed;
};

/**
 * Prefer the machine price; fall back to the seller's display label. Returns
 * null when neither is set so callers can omit the clause entirely instead of
 * printing an empty one.
 */
export const formatPrice = (
  amount: string | null,
  currency: string | null,
  label: string | null,
): string | null => {
  if (amount !== null) {
    const value = trimAmount(amount);

    if (currency === null) {
      return value;
    }

    return currency.toUpperCase() === "USD"
      ? `$${value}`
      : `${value} ${currency.toUpperCase()}`;
  }

  return label;
};

/**
 * Joins the non-null parts of a code comment with `·` separators. `prefix`
 * carries the host language's comment marker.
 */
export const commentLine = (parts: (string | null)[], prefix = "//"): string =>
  `${prefix} ${parts.filter((part): part is string => part !== null).join(" · ")}`;
