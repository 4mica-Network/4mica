import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { LookupFunction } from "node:net";
import { isPublicAddress, isPublicHostname } from "@utils/public-host";

export class UnsafeDestinationError extends Error {
  override name = "UnsafeDestinationError";
}

export type OutboundPhase = "dns" | "request";

export class OutboundTimeoutError extends Error {
  override name = "TimeoutError";

  constructor(readonly phase: OutboundPhase) {
    super(
      phase === "dns"
        ? "DNS resolution did not finish before the deadline."
        : "The request did not finish before the deadline.",
    );
  }
}

export class OutboundAbortedError extends Error {
  override name = "AbortError";

  constructor() {
    super("The outbound request was cancelled.");
  }
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
  signal?: AbortSignal;
}

interface Deadline {
  signal: AbortSignal;
  enter: (phase: OutboundPhase) => void;
  dispose: () => void;
}

const startDeadline = (
  timeoutMs: number,
  outer: AbortSignal | undefined,
): Deadline => {
  const controller = new AbortController();
  let phase: OutboundPhase = "dns";
  const timer = setTimeout(
    () => controller.abort(new OutboundTimeoutError(phase)),
    timeoutMs,
  );
  const cancel = () => controller.abort(new OutboundAbortedError());
  if (outer?.aborted) {
    cancel();
  } else {
    outer?.addEventListener("abort", cancel, { once: true });
  }
  return {
    signal: controller.signal,
    enter: (next) => {
      phase = next;
    },
    dispose: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", cancel);
    },
  };
};

const raceAbort = <T>(work: Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });

const send = (
  url: URL,
  pinned: LookupAddress,
  { headers, body }: OutboundPost,
  signal: AbortSignal,
): Promise<{ status: number }> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
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
        signal.removeEventListener("abort", onAbort);
        response.destroy();
        resolve({ status: response.statusCode ?? 0 });
      },
    );
    const onAbort = () => req.destroy(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    req.on("error", (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.aborted ? signal.reason : error);
    });
    req.end(body);
  });

export const postToPublicUrl = async (
  raw: string,
  post: OutboundPost,
): Promise<{ status: number }> => {
  const url = parseOutboundUrl(raw);
  const deadline = startDeadline(post.timeoutMs, post.signal);
  try {
    deadline.signal.throwIfAborted();
    const pinned = await raceAbort(
      resolvePublicAddress(url.hostname),
      deadline.signal,
    );
    deadline.enter("request");
    return await send(url, pinned, post, deadline.signal);
  } finally {
    deadline.dispose();
  }
};
