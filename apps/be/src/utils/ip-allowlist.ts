import { BlockList, isIP } from "node:net";

const V4_MAPPED = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

const canonicalV6 = (address: string): string =>
  new URL(`http://[${address}]`).hostname.slice(1, -1);

const unmapV4 = (high: string, low: string): string => {
  const hi = Number.parseInt(high, 16);
  const lo = Number.parseInt(low, 16);
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
};

export const canonicalIp = (raw: string): string | null => {
  const value = raw.trim();
  const family = isIP(value);
  if (family === 4) {
    return value;
  }
  if (family !== 6) {
    return null;
  }
  const canonical = canonicalV6(value);
  const mapped = V4_MAPPED.exec(canonical);
  return mapped?.[1] && mapped[2] ? unmapV4(mapped[1], mapped[2]) : canonical;
};

const maskV4 = (address: string, prefix: number): string => {
  const value = address
    .split(".")
    .reduce((acc, octet) => acc * 256 + Number(octet), 0);
  const size = 2 ** (32 - prefix);
  const network = Math.floor(value / size) * size;
  return [24, 16, 8, 0]
    .map((shift) => Math.floor(network / 2 ** shift) % 256)
    .join(".");
};

export const normalizeIpEntry = (raw: string): string | null => {
  const [address, prefixText, extra] = raw.trim().split("/");
  if (extra !== undefined || !address) {
    return null;
  }
  const family = isIP(address);
  if (family === 0) {
    return null;
  }
  if (prefixText === undefined) {
    return canonicalIp(address);
  }
  if (!/^\d{1,3}$/.test(prefixText)) {
    return null;
  }
  const prefix = Number(prefixText);
  const max = family === 4 ? 32 : 128;
  if (prefix > max) {
    return null;
  }
  if (prefix === max) {
    return canonicalIp(address);
  }
  return family === 4
    ? `${maskV4(address, prefix)}/${prefix}`
    : `${canonicalV6(address)}/${prefix}`;
};

const toBlockList = (entries: readonly string[]): BlockList => {
  const list = new BlockList();
  for (const entry of entries) {
    const normalized = normalizeIpEntry(entry);
    if (!normalized) {
      continue;
    }
    const [address = "", prefix] = normalized.split("/");
    const family = isIP(address) === 4 ? "ipv4" : "ipv6";
    if (prefix === undefined) {
      list.addAddress(address, family);
    } else {
      list.addSubnet(address, Number(prefix), family);
    }
  }
  return list;
};

export const ipAllowed = (ip: string, entries: readonly string[]): boolean => {
  const address = canonicalIp(ip);
  if (!address) {
    return false;
  }
  return toBlockList(entries).check(
    address,
    isIP(address) === 4 ? "ipv4" : "ipv6",
  );
};
