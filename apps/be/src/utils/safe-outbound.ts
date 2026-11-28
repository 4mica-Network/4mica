import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { LookupFunction } from "node:net";
import { isPublicAddress, isPublicHostname } from "@utils/public-host";

export class UnsafeDestinationError extends Error {
  override name = "UnsafeDestinationError";
}

export class OutboundTimeoutError extends Error {
  override name = "TimeoutError";
}

export const parseOutboundUrl = (raw: string): URL => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeDestinationError("The URL is not valid.");
  }
  if (url.protocol !== "https:") {
    throw new UnsafeDestinationError("The URL must use https.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new UnsafeDestinationError("The URL must not contain credentials.");
  }
  if (!isPublicHostname(url.hostname)) {
    throw new UnsafeDestinationError("The URL must point to a public host.");
  }
  return url;
};

export const resolvePublicAddress = async (
  hostname: string,
): Promise<LookupAddress> => {
  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    addresses = [];
  }
  const [first] = addresses;
  if (!first || !addresses.every(({ address }) => isPublicAddress(address))) {
    throw new UnsafeDestinationError(
      "The URL does not resolve to a public address.",
    );
  }
  return first;
};

export const pinnedLookup =
  (pinned: LookupAddress): LookupFunction =>
  (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [pinned]);
    } else {
      callback(null, pinned.address, pinned.family);
    }
  };

export interface OutboundPost {
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

export const postToPublicUrl = async (
  raw: string,
  { headers, body, timeoutMs }: OutboundPost,
): Promise<{ status: number }> => {
  const url = parseOutboundUrl(raw);
  const pinned = await resolvePublicAddress(url.hostname);

  return new Promise((resolve, reject) => {
    const req = request(
      {
        protocol: "https:",
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        servername: url.hostname,
        lookup: pinnedLookup(pinned),
        agent: false,
        headers: { ...headers, "content-length": Buffer.byteLength(body) },
      },
      (response) => {
        clearTimeout(timer);
        response.destroy();
        resolve({ status: response.statusCode ?? 0 });
      },
    );
    const timer = setTimeout(
      () => req.destroy(new OutboundTimeoutError("timed out")),
      timeoutMs,
    );
    req.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    req.end(body);
  });
};
