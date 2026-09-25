import type { HttpMethodName, PublicVisibility } from "@stores/apiListing/type";

export const VISIBILITY_LABEL_KEYS = {
  PRIVATE: "apiListing.visibility.private",
  UNLISTED: "apiListing.visibility.unlisted",
  PUBLIC: "apiListing.visibility.public",
} as const satisfies Record<PublicVisibility, string>;

export const VISIBILITY_TAG_VARIANT = {
  PRIVATE: "neutral",
  UNLISTED: "warning",
  PUBLIC: "success",
} as const satisfies Record<
  PublicVisibility,
  "neutral" | "warning" | "success"
>;

export const VISIBILITY_OPTIONS = (
  Object.keys(VISIBILITY_LABEL_KEYS) as PublicVisibility[]
).map((value) => ({ value, labelKey: VISIBILITY_LABEL_KEYS[value] }));

export const HTTP_METHOD_OPTIONS = (
  ["GET", "POST", "PUT", "PATCH", "DELETE"] as HttpMethodName[]
).map((value) => ({ value, title: value }));

export const CATEGORY_SUGGESTIONS = [
  "Credit",
  "Data",
  "Identity",
  "Inference",
  "Payments",
  "Search",
  "Storage",
] as const;

export const trimAmount = (amount: string | null): string => {
  if (amount === null) {
    return "";
  }
  if (!amount.includes(".")) {
    return amount;
  }
  const trimmed = amount.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" || trimmed === "-" ? "0" : trimmed;
};

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
