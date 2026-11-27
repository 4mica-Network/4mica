export const MAX_ALLOWLIST_ENTRIES = 100;

const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`);

export const isIPv4 = (value: string): boolean => IPV4.test(value);

export const isIPv6 = (value: string): boolean => {
  if (!value.includes(":") || !/^[0-9a-fA-F:.]+$/.test(value)) {
    return false;
  }
  try {
    return new URL(`http://[${value}]/`).hostname.length > 2;
  } catch {
    return false;
  }
};

export const isIpOrCidr = (entry: string): boolean => {
  const parts = entry.split("/");
  if (parts.length > 2) {
    return false;
  }
  const [address, prefix] = parts;
  const v4 = isIPv4(address);
  if (!v4 && !isIPv6(address)) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  if (!/^\d{1,3}$/.test(prefix)) {
    return false;
  }
  return Number(prefix) <= (v4 ? 32 : 128);
};

export const parseAllowlist = (raw: string): string[] => [
  ...new Set(
    raw
      .split(/[\s,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  ),
];

export const formatAllowlist = (entries: string[]): string =>
  entries.join("\n");

export const invalidAllowlistEntries = (entries: string[]): string[] =>
  entries.filter((entry) => !isIpOrCidr(entry));

export const allowlistError = (
  entries: string[],
  t: (key: string, options?: Record<string, unknown>) => string,
): string | undefined => {
  const invalid = invalidAllowlistEntries(entries);
  if (invalid.length > 0) {
    return t("ipAllowlist.invalid", { entries: invalid.join(", ") });
  }
  if (entries.length > MAX_ALLOWLIST_ENTRIES) {
    return t("ipAllowlist.tooMany", { max: MAX_ALLOWLIST_ENTRIES });
  }
  return undefined;
};
