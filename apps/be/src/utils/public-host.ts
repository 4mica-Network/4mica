import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const PRIVATE_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home.arpa",
];

export const isPublicHostname = (hostname: string): boolean => {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");

  if (host === "" || host === "localhost" || isIP(host) !== 0) {
    return false;
  }

  return (
    host.includes(".") &&
    !PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
};

const NON_PUBLIC_V4: readonly [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const NON_PUBLIC_V6: readonly [string, number][] = [
  ["::", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];

const nonPublic = new BlockList();
for (const [network, prefix] of NON_PUBLIC_V4) {
  nonPublic.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of NON_PUBLIC_V6) {
  nonPublic.addSubnet(network, prefix, "ipv6");
}

export const isPublicAddress = (address: string): boolean => {
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  return !nonPublic.check(address, family === 4 ? "ipv4" : "ipv6");
};

export const resolvesPublicly = async (hostname: string): Promise<boolean> => {
  if (!isPublicHostname(hostname)) {
    return false;
  }
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return (
      addresses.length > 0 &&
      addresses.every(({ address }) => isPublicAddress(address))
    );
  } catch {
    return false;
  }
};
