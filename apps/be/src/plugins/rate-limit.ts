import { config } from "@config/index";
import fastifyRateLimit from "@fastify/rate-limit";
import { appLogger } from "@logger/index";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
  preHandlerAsyncHookHandler,
} from "fastify";

const TOO_MANY_REQUESTS = {
  error: "rate_limit_exceeded",
  message: "Too many requests. Retry later.",
} as const;

const isExempt = (request: FastifyRequest): boolean =>
  request.method === "OPTIONS" || request.url.startsWith("/health");

const userKey = (request: FastifyRequest): string =>
  request.auth?.clerkUserId ?? request.ip;

const ipKey = (request: FastifyRequest): string => request.ip;

/** Logged instead of `request.url`: some query strings carry tokens. */
const pathOf = (request: FastifyRequest): string =>
  request.url.split("?", 1)[0] ?? request.url;

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

const ipShield = (app: FastifyInstance): onRequestAsyncHookHandler => {
  const check = limiter(app, config.rateLimit.ipMax, ipKey);

  return async (request, reply) => {
    if (isExempt(request)) {
      return;
    }

    const result = await check(request);
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
      path: pathOf(request),
    });

    return reject(reply, result);
  };
};

const userLimit = (
  app: FastifyInstance,
  max: number,
  scope: string,
): preHandlerAsyncHookHandler => {
  const check = limiter(app, max, userKey);

  return async (request, reply) => {
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
      path: pathOf(request),
    });

    return reject(reply, result);
  };
};

export const registerRateLimit = async (
  app: FastifyInstance,
): Promise<void> => {
  await app.register(fastifyRateLimit, {
    global: false,
    cache: 10_000,
    timeWindow: config.rateLimit.windowMs,
  });

  app.addHook("onRequest", ipShield(app));
  app.addHook("preHandler", userLimit(app, config.rateLimit.userMax, "User"));
};

/**
 * Budget per API key on the server-to-server `/v1` routes. The IP shield alone
 * would let one leaked key spread across many hosts; this caps the key itself.
 * Must run after `authenticateApiKey`, which is what sets `request.apiKey`.
 */
export const apiKeyRateLimit = (
  app: FastifyInstance,
): preHandlerAsyncHookHandler => {
  if (!config.rateLimit.enabled) {
    return async () => {};
  }

  const check = limiter(
    app,
    config.rateLimit.apiKeyMax,
    (request) => `key:${request.apiKey?.id ?? request.ip}`,
  );

  return async (request, reply) => {
    if (!request.apiKey) {
      return;
    }

    const result = await check(request);

    if (result.isAllowed || !result.isExceeded) {
      return;
    }

    appLogger.warn("API key rate limit exceeded", {
      apiKeyId: request.apiKey.id,
      method: request.method,
      path: pathOf(request),
    });

    return reject(reply, result);
  };
};

export const sensitiveRateLimit = (
  app: FastifyInstance,
): preHandlerAsyncHookHandler => {
  if (!config.rateLimit.enabled) {
    return async () => {};
  }

  return userLimit(app, config.rateLimit.sensitiveMax, "Sensitive endpoint");
};
