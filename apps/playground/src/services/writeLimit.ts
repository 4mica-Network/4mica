import "server-only";

import { auth } from "@clerk/nextjs/server";
import Redis from "ioredis";
import { serverEnv } from "@/env.server";
import { requestLogger } from "@/logger";
import { createRateLimiter, type RateLimiter } from "@/utils/rateLimit";

export const WRITE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

const KEY_PREFIX = "playground:write";

const READY_TIMEOUT_MS = 500;

const CONNECTING = new Set(["wait", "connecting", "connect"]);

const STORE = Symbol.for("4mica.playground.writeLimiter");

interface Store {
  memory: RateLimiter;
  shared: Redis | null;
}

const connect = (url: string): Redis => {
  const client = new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    commandTimeout: 500,
  });
  client.on("error", () => {});
  return client;
};

const store = (): Store => {
  const scope = globalThis as typeof globalThis & { [STORE]?: Store };

  if (!scope[STORE]) {
    const url = serverEnv().VALKEY_URL;
    scope[STORE] = {
      memory: createRateLimiter(WRITE_LIMIT),
      shared: url ? connect(url) : null,
    };
  }

  return scope[STORE];
};

const ready = (client: Redis): Promise<void> => {
  if (client.status === "ready") {
    return Promise.resolve();
  }

  if (!CONNECTING.has(client.status)) {
    return Promise.reject(new Error(`valkey is ${client.status}`));
  }

  return new Promise((resolve, reject) => {
    const onReady = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      client.off("ready", onReady);
      reject(new Error("valkey did not become ready in time"));
    }, READY_TIMEOUT_MS);
    client.once("ready", onReady);
  });
};

const takeShared = async (
  client: Redis,
  id: string,
  now: number,
): Promise<boolean> => {
  await ready(client);

  const window = Math.floor(now / WRITE_LIMIT.windowMs);
  const key = `${KEY_PREFIX}:${id}:${window}`;
  const replies = await client
    .multi()
    .incr(key)
    .pexpire(key, WRITE_LIMIT.windowMs)
    .exec();
  const [error, count] = replies?.[0] ?? [new Error("empty reply"), null];

  if (error || typeof count !== "number") {
    throw error ?? new Error("unexpected INCR reply");
  }

  return count <= WRITE_LIMIT.limit;
};

export const allowWrite = async (action: string): Promise<boolean> => {
  let clerkUserId: string | null = null;

  try {
    ({ userId: clerkUserId } = await auth());
  } catch {
    return true;
  }

  if (!clerkUserId) {
    return true;
  }

  const { memory, shared } = store();
  let allowed: boolean;

  if (shared) {
    try {
      allowed = await takeShared(shared, clerkUserId, Date.now());
    } catch (error) {
      (await requestLogger()).warn(
        "shared write limit unavailable; using the in-process limit",
        {
          action,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      allowed = memory.take(clerkUserId);
    }
  } else {
    allowed = memory.take(clerkUserId);
  }

  if (!allowed) {
    (await requestLogger()).warn("write rate limit exceeded", {
      action,
      clerkUserId,
    });
  }

  return allowed;
};
