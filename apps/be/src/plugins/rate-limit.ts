import fastifyRateLimit from "@fastify/rate-limit";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
  preHandlerAsyncHookHandler,
} from "fastify";
import { config } from "../config/index";
import { appLogger } from "../logger/index";

const TOO_MANY_REQUESTS = {
  error: "rate_limit_exceeded",
  message: "Too many requests. Retry later.",
} as const;

/** Health probes and CORS preflights must never be throttled. */
const isExempt = (request: FastifyRequest): boolean =>
  request.method === "OPTIONS" || request.url.startsWith("/health");

/**
 * Authenticated traffic is keyed by Clerk user id so one client behind a shared
 * NAT cannot exhaust everyone's budget, and one user cannot buy more budget by
 * rotating IPs. Anything unauthenticated falls back to the caller's address.
 */
const userKey = (request: FastifyRequest): string =>
  request.auth?.clerkUserId ?? request.ip;

const ipKey = (request: FastifyRequest): string => request.ip;

/** The counted (non-allowlisted) branch of a limiter check. */
type CountedResult = Extract<
  Awaited<ReturnType<ReturnType<FastifyInstance["createRateLimit"]>>>,
  { isExceeded: boolean }
>;

const reject = (reply: FastifyReply, result: CountedResult) => {
  reply.header("x-ratelimit-limit", result.max);
  reply.header("x-ratelimit-remaining", 0);
  reply.header("x-ratelimit-reset", result.ttlInSeconds);
  reply.header("retry-after", result.ttlInSeconds);

  return reply.code(429).send(TOO_MANY_REQUESTS);
};

/**
 * The plugin's own hooks attach at the *route* level, so they run after route
 * guards — a rejected token would answer 401 before ever being counted. Both
 * layers are therefore built from `createRateLimit` and installed as
 * instance-level hooks, which Fastify runs ahead of any route hook.
 */
const limiter = (
  app: FastifyInstance,
  max: number,
  keyGenerator: (request: FastifyRequest) => string,
) =>
  app.createRateLimit({
    max,
    timeWindow: config.rateLimit.windowMs,
    keyGenerator,
  });

/**
 * Layer 1: an IP-keyed shield ahead of everything, including Clerk
 * verification, so token checks and the 401s they produce are bounded too.
 */
const ipShield = (app: FastifyInstance): onRequestAsyncHookHandler => {
  const check = limiter(app, config.rateLimit.ipMax, ipKey);

  return async (request, reply) => {
    if (isExempt(request)) {
      return;
    }

    const result = await check(request);

    // `isAllowed` means "allowlisted", not "under the limit" — the counter
    // verdict lives on `isExceeded`.
    if (result.isAllowed) {
      return;
    }

    reply.header("x-ratelimit-limit", result.max);
    reply.header("x-ratelimit-remaining", result.remaining);
    reply.header("x-ratelimit-reset", result.ttlInSeconds);

    if (!result.isExceeded) {
      return;
    }

    appLogger.warn("IP rate limit exceeded", {
      key: result.key,
      method: request.method,
      url: request.url,
    });

    return reject(reply, result);
  };
};

/**
 * Layer 2: a user-keyed budget on `preHandler`, the earliest point at which
 * `request.auth` has been populated by the route's authentication guard.
 */
const userLimit = (
  app: FastifyInstance,
  max: number,
  scope: string,
): preHandlerAsyncHookHandler => {
  const check = limiter(app, max, userKey);

  return async (request, reply) => {
    // Unauthenticated requests were already bounded by the IP layer, and a
    // rejected token never reaches preHandler at all.
    if (!request.auth) {
      return;
    }

    const result = await check(request);

    if (result.isAllowed || !result.isExceeded) {
      return;
    }

    appLogger.warn(`${scope} rate limit exceeded`, {
      key: result.key,
      method: request.method,
      url: request.url,
    });

    return reject(reply, result);
  };
};

export const registerRateLimit = async (
  app: FastifyInstance,
): Promise<void> => {
  // Registered only for its store and `createRateLimit` decorator; `global`
  // stays off so the plugin installs no route hooks of its own.
  await app.register(fastifyRateLimit, {
    global: false,
    cache: 10_000,
    timeWindow: config.rateLimit.windowMs,
  });

  app.addHook("onRequest", ipShield(app));
  app.addHook("preHandler", userLimit(app, config.rateLimit.userMax, "User"));
};

/**
 * Tighter, user-keyed budget for endpoints that mint or revoke credentials.
 * Attach after the route's existing `preHandler` guards.
 */
export const sensitiveRateLimit = (
  app: FastifyInstance,
): preHandlerAsyncHookHandler => {
  // The plugin is not registered when limiting is off, so there is no decorator.
  if (!config.rateLimit.enabled) {
    return async () => {};
  }

  return userLimit(app, config.rateLimit.sensitiveMax, "Sensitive endpoint");
};
