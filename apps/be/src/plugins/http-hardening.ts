import { randomUUID } from "node:crypto";
import { appLogger, httpLogger } from "@logger/index";
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifySchemaValidationError,
} from "fastify";

export const REQUEST_ID_HEADER = "x-request-id";

export const genReqId = (): string => randomUUID();

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
} as const;

const STATUS_ERRORS: Record<number, string> = {
  400: "invalid_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  406: "not_acceptable",
  408: "request_timeout",
  409: "conflict",
  413: "payload_too_large",
  414: "uri_too_long",
  415: "unsupported_media_type",
  429: "rate_limit_exceeded",
};

const prismaCode = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : undefined;
};

const pathOf = (request: FastifyRequest): string =>
  request.url.split("?", 1)[0] ?? request.url;

const issuePath = (issue: FastifySchemaValidationError): string => {
  const base = issue.instancePath.replace(/^\//, "").replaceAll("/", ".");
  const missing = (issue.params as { missingProperty?: unknown })
    ?.missingProperty;
  const leaf = typeof missing === "string" ? missing : "";
  const path = [base, leaf].filter((part) => part !== "").join(".");

  return path === "" ? "(root)" : path;
};

const sendError = (
  reply: FastifyReply,
  status: number,
  error: string,
  message: string,
) =>
  reply.code(status).send({
    error,
    message,
    requestId: reply.request.id,
  });

export const installHttpHardening = (app: FastifyInstance): void => {
  app.addHook("onRequest", async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      reply.header(name, value);
    }
    if (!reply.hasHeader("cache-control")) {
      reply.header("cache-control", "no-store");
    }
    return payload;
  });

  app.addHook("onResponse", async (request, reply) => {
    httpLogger.info("request", {
      reqId: request.id,
      method: request.method,
      path: pathOf(request),
      route: request.routeOptions.url ?? null,
      status: reply.statusCode,
      ms: Math.round(reply.elapsedTime),
      ip: request.ip,
      userId: request.user?.id ?? null,
      apiKeyId: request.apiKey?.id ?? null,
    });
  });

  app.setNotFoundHandler((_request, reply) =>
    sendError(reply, 404, "not_found", "No such route."),
  );

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "The request failed validation.",
        issues: error.validation.map((issue) => ({
          path: issuePath(issue),
          message: issue.message ?? "is invalid",
        })),
        requestId: request.id,
      });
    }

    const prisma = prismaCode(error);

    if (prisma === "P2002") {
      return sendError(
        reply,
        409,
        "conflict",
        "That conflicts with an existing record.",
      );
    }
    if (prisma === "P2034") {
      return sendError(
        reply,
        409,
        "conflict",
        "Another change landed at the same time. Try again.",
      );
    }
    if (prisma === "P2025") {
      return sendError(reply, 404, "not_found", "That record does not exist.");
    }

    const status =
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode < 500
        ? error.statusCode
        : 500;

    if (status < 500) {
      return sendError(
        reply,
        status,
        STATUS_ERRORS[status] ?? "bad_request",
        error.message,
      );
    }

    appLogger.error("Unhandled request error", {
      reqId: request.id,
      method: request.method,
      path: pathOf(request),
      userId: request.user?.id ?? null,
      error,
    });

    return sendError(
      reply,
      500,
      "internal_error",
      "Something went wrong. Quote the request id if you contact support.",
    );
  });
};
