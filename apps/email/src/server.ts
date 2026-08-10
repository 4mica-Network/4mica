import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config/index";
import { installShutdownHandlers, isAcceptingTraffic } from "./lifecycle/index";
import { appLogger } from "./logger/index";
import { registerRateLimit } from "./plugins/rate-limit";
import { type RouteRegistration, routes } from "./routes/index";

export const initApp = async (
  toRegister: RouteRegistration[] = routes,
): Promise<FastifyInstance> => {
  const app = Fastify({
    trustProxy: true,
    // Weekly reports and multi-line announcements are the largest bodies here;
    // 256 KiB is well clear of them.
    bodyLimit: 262_144,
  });

  // Route schemas carry a JSON Schema body purely so Swagger can document each
  // template. Validation itself is valibot's job in the handler — it is the
  // same schema the client's types come from, and it produces the
  // `{ error, message, issues[] }` envelope callers parse. Letting ajv run
  // first would reject bodies with its own generic "Bad Request" instead.
  app.setValidatorCompiler(() => (data) => ({ value: data }));

  // First hook of all: once draining, refuse new work before spending any
  // effort on rate-limit accounting or rendering.
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

  if (config.rateLimit.enabled) {
    await registerRateLimit(app);
  }

  if (config.isDev) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "4Mica email service",
          description:
            "Renders React Email templates and sends them through Resend. One route per template.",
          version: "0.1.0",
        },
        servers: [{ url: `http://localhost:${config.env.PORT}` }],
        tags: [
          { name: "system", description: "Health and liveness" },
          { name: "emails", description: "One route per template" },
        ],
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
    `@4mica/email listening on http://${config.env.HOST}:${config.env.PORT}`,
    { dryRun: config.email.dryRun },
  );

  if (config.email.dryRun) {
    appLogger.warn(
      "EMAIL_DRY_RUN is enabled — messages are rendered and logged, not delivered",
    );
  }

  if (config.isDev) {
    appLogger.info(`Swagger UI: http://localhost:${config.env.PORT}/docs`);
  }

  return app;
};
