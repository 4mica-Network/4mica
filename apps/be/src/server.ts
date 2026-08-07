import { clerkAuth } from "@4mica/auth";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import { loadUser } from "./auth/user-store";
import { config } from "./config/index";
import { appLogger } from "./logger/index";
import { type RouteRegistration, routes } from "./routes/index";

const SHUTDOWN_TIMEOUT_MS = 10_000;

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
  let shuttingDown = false;

  const shutdown = async (reason: string, failed = false): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    appLogger.info(`Shutting down (${reason})`);

    const force = setTimeout(() => {
      appLogger.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();

    let exitCode = failed ? 1 : 0;

    try {
      await app.close();
      const { disconnect } = await import("@4mica/db");
      await disconnect();
    } catch (error) {
      appLogger.error("Error during shutdown", { error });
      exitCode = 1;
    } finally {
      clearTimeout(force);
      process.exit(exitCode);
    }
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  process.on("uncaughtException", (error) => {
    appLogger.error("Uncaught exception", { error });
    void shutdown("uncaughtException", true);
  });

  process.on("unhandledRejection", (reason) => {
    appLogger.error("Unhandled rejection", { reason });
    void shutdown("unhandledRejection", true);
  });

  await app.listen({ host: config.env.HOST, port: config.env.PORT });

  appLogger.info(
    `@4mica/be listening on http://${config.env.HOST}:${config.env.PORT}`,
  );

  if (config.isDev) {
    appLogger.info(`Swagger UI: http://localhost:${config.env.PORT}/docs`);
  }

  return app;
};
