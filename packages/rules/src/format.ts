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
  if (amount === null) {
    return label;
  }
  const value = trimAmount(amount);
  if (currency === null) {
    return value;
  }
  return currency.toUpperCase() === "USD"
    ? `$${value}`
    : `${value} ${currency.toUpperCase()}`;
};
