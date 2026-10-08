import { clerkAuth } from "@4mica/auth";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import { loadUser } from "./auth/user-store";
import { config, productionWarnings } from "./config/index";
import {
  startOnboardingDrip,
  stopOnboardingDrip,
} from "./jobs/onboarding/index";
import { installShutdownHandlers, isAcceptingTraffic } from "./lifecycle/index";
import { appLogger } from "./logger/index";
import { genReqId, installHttpHardening } from "./plugins/http-hardening";
import { registerRateLimit } from "./plugins/rate-limit";
import { type RouteRegistration, routes } from "./routes/index";
import { getEmailClient } from "./services/email";

/**
 * The dashboard is the only browser client, so production allows exactly its
 * origin plus anything listed in CORS_ORIGINS — not every *.4mica.io host,
 * several of which serve user-authored content.
 */
const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

const appOrigin = originOf(config.appUrl);

const DEV_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/\[::1\](:\d+)?$/,
];

const allowedPatterns = config.isProd ? [] : DEV_ORIGIN_PATTERNS;

const isAllowedOrigin = (origin: string): boolean =>
  origin === appOrigin ||
  config.extraCorsOrigins.includes(origin) ||
  allowedPatterns.some((pattern) => pattern.test(origin));

export const initApp = async (
  toRegister: RouteRegistration[] = routes,
): Promise<FastifyInstance> => {
  const app = Fastify({
    // A hop count, never `true`: the host nginx appends to X-Forwarded-For, so
    // trusting the whole chain would hand `request.ip` — and with it the IP
    // rate limit — to whatever the client put in the header.
    trustProxy: (_address, hop) => hop < config.trustProxyHops,
    genReqId,
    requestIdHeader: false,
    bodyLimit: 1_048_576,
    ajv: { customOptions: { removeAdditional: "all", coerceTypes: "array" } },
  });

  installHttpHardening(app);

  // First hook after the request id: once draining, refuse new work before
  // spending any effort on CORS, rate-limit accounting or token verification.
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

  app.decorate("email", getEmailClient());

  app.addHook("onClose", stopOnboardingDrip);

  app.addHook("onClose", async () => {
    const { disconnect } = await import("@4mica/db");
    await disconnect();
  });

  // Auth is a bearer token, never a cookie, so credentialed CORS is off.
  await app.register(cors, {
    credentials: false,
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
          { name: "verification", description: "Email verification" },
          { name: "developer", description: "API keys and webhooks" },
          {
            name: "banners",
            description: "Dashboard promo banners and interaction tracking",
          },
          {
            name: "wallets",
            description: "On-chain wallets the account has proved control of",
          },
          {
            name: "api-listings",
            description: "Paywalled APIs the account publishes and is paid for",
          },
          {
            name: "agents",
            description:
              "Agent identities the account owns, as payer and as seller",
          },
          {
            name: "payments",
            description: "x402 payments this account sent or received",
          },
          {
            name: "customers",
            description: "Counterparties that spend through this account",
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
            },
            apiKeyAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "4mica_sk_…",
              description:
                "A key from Settings → Developer. Used by services calling 4Mica without a signed-in user.",
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

  for (const warning of productionWarnings(config.env)) {
    appLogger.warn(`Production configuration: ${warning}`);
  }

  await app.listen({ host: config.env.HOST, port: config.env.PORT });

  appLogger.info(
    `@4mica/be listening on http://${config.env.HOST}:${config.env.PORT}`,
  );

  appLogger.info(
    app.email
      ? `Email service configured at ${config.emailServiceUrl}`
      : "Email service not configured (EMAIL_SERVICE_URL unset); sending disabled",
  );

  if (
    !config.isProd &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(config.appUrl)
  ) {
    appLogger.warn(
      `APP_URL resolves to ${config.appUrl}; verification links will redirect there, not to a local dashboard`,
    );
  }

  if (config.isDev) {
    appLogger.info(`Swagger UI: http://localhost:${config.env.PORT}/docs`);
  }

  await startOnboardingDrip(app);

  return app;
};
