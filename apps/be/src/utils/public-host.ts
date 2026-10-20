import { isIP } from "node:net";

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
