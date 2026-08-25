import { clerkAuth } from "@4mica/auth";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import { loadUser } from "./auth/user-store";
import { config } from "./config/index";
import { installShutdownHandlers, isAcceptingTraffic } from "./lifecycle/index";
import { appLogger } from "./logger/index";
import { registerRateLimit } from "./plugins/rate-limit";
import { type RouteRegistration, routes } from "./routes/index";

const PROD_ORIGIN_PATTERNS = [
  /^https:\/\/([a-z0-9-]+\.)*4mica\.io$/,
  /^https:\/\/([a-z0-9-]+\.)*4mica\.xyz$/,
];

const DEV_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/\[::1\](:\d+)?$/,
];

const allowedPatterns = config.isProd
  ? PROD_ORIGIN_PATTERNS
  : [...PROD_ORIGIN_PATTERNS, ...DEV_ORIGIN_PATTERNS];

const isAllowedOrigin = (origin: string): boolean =>
  config.extraCorsOrigins.includes(origin) ||
  allowedPatterns.some((pattern) => pattern.test(origin));

export const initApp = async (
  toRegister: RouteRegistration[] = routes,
): Promise<FastifyInstance> => {
  const app = Fastify({
    trustProxy: true,
    bodyLimit: 1_048_576,
    ajv: { customOptions: { removeAdditional: "all", coerceTypes: "array" } },
  });

  // First hook of all: once draining, refuse new work before spending any
  // effort on CORS, rate-limit accounting or token verification.
  app.addHook("onRequest", async (request, reply) => {
    if (isAcceptingTraffic() || request.url.startsWith("/health")) {
      return;
    }

    reply.header("retry-after", Math.ceil(config.shutdown.drainMs / 1000));
    reply.header("connection", "close");

    return reply.code(503).send({
      error: "service_unavailable",
      message: "The service is shutting down. Retry shortly.",
    });
  });

  // Fastify owns database teardown, so `initApp` is self-contained and tests
  // that call `app.close()` release the client too.
  app.addHook("onClose", async () => {
    const { disconnect } = await import("@4mica/db");
    await disconnect();
  });

  await app.register(cors, {
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      appLogger.warn("Blocked CORS origin", { origin });
      callback(null, false);
    },
  });

  if (config.rateLimit.enabled) {
    await registerRateLimit(app);
  }

  await app.register(clerkAuth, {
    secretKey: config.env.CLERK_SECRET_KEY,
    publishableKey: config.env.CLERK_PUBLISHABLE_KEY,
    jwtKey: config.clerkJwtKey,
    authorizedParties: config.clerkAuthorizedParties,
    loadUser,
    logger: {
      warn: (message, meta) => {
        appLogger.warn(message, meta);
      },
    },
  });

  if (config.isDev) {
    await app.register(swagger, {
      openapi: {
        info: { title: "4Mica Backend API", version: "0.1.0" },
        servers: [{ url: `http://localhost:${config.env.PORT}` }],
        tags: [
          { name: "system", description: "Health and diagnostics" },
          { name: "account", description: "Authenticated user account" },
          { name: "developer", description: "API keys and webhooks" },
          {
            name: "banners",
            description: "Dashboard promo banners and interaction tracking",
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
            },
          },
        },
      },
    });
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }

  for (const { plugin, prefix } of toRegister) {
    await app.register(plugin, prefix ? { prefix } : {});
  }

  await app.ready();

  return app;
};

export const runServer = async (): Promise<FastifyInstance> => {
  const app = await initApp(routes);

  installShutdownHandlers(app);

  await app.listen({ host: config.env.HOST, port: config.env.PORT });

  appLogger.info(
    `@4mica/be listening on http://${config.env.HOST}:${config.env.PORT}`,
  );

  if (config.isDev) {
    appLogger.info(`Swagger UI: http://localhost:${config.env.PORT}/docs`);
  }

  return app;
};
