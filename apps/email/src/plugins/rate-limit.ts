import { config } from "@config/index";
import fastifyRateLimit from "@fastify/rate-limit";
import { appLogger } from "@logger/index";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
} from "fastify";

const TOO_MANY_REQUESTS = {
  error: "rate_limit_exceeded",
  message: "Too many requests. Retry later.",
} as const;

const isExempt = (request: FastifyRequest): boolean =>
  request.method === "OPTIONS" || request.url.startsWith("/health");

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
 * A single IP-keyed layer, unlike apps/be's two. This service has no
 * authenticated principal to key a second budget on — every caller is another
 * internal service reached over the private network.
 */
const ipShield = (app: FastifyInstance): onRequestAsyncHookHandler => {
  const check = app.createRateLimit({
    max: config.rateLimit.ipMax,
    timeWindow: config.rateLimit.windowMs,
    keyGenerator: (request: FastifyRequest) => request.ip,
  });

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
      url: request.url,
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
};
