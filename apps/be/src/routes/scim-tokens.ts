import {
  createScimTokenHandler,
  listScimTokensHandler,
  revokeScimTokenHandler,
} from "@controllers/scim-tokens/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  errorResponseSchema,
  idParam,
  limitedResponses,
} from "./schema-fragments";

const nullDate = {
  type: "string",
  format: "date-time",
  nullable: true,
} as const;

const scimTokenResponseSchema = {
  type: "object",
  required: ["id", "name", "prefix", "last4", "createdAt"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    prefix: { type: "string" },
    last4: { type: "string" },
    lastUsedAt: nullDate,
    revokedAt: nullDate,
    createdAt: { type: "string", format: "date-time" },
    createdBy: {
      type: "object",
      nullable: true,
      properties: { id: { type: "string" }, name: { type: "string" } },
    },
  },
} as const;

const createdScimTokenResponseSchema = {
  ...scimTokenResponseSchema,
  required: [...scimTokenResponseSchema.required, "secret"],
  properties: {
    ...scimTokenResponseSchema.properties,
    secret: { type: "string" },
  },
} as const;

const forbiddenResponseSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    reauthWithinMinutes: { type: "integer" },
    domain: { type: "string" },
  },
} as const;

const PREFIX = "/me/organization/scim-tokens";
const tags = ["organizations"];
const security = [{ bearerAuth: [] }];

const errors = {
  ...limitedResponses,
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: forbiddenResponseSchema,
  404: errorResponseSchema,
};

export const scimTokenRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);
  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  app.get(
    PREFIX,
    {
      ...base,
      schema: {
        tags,
        summary: "SCIM provisioning tokens of the active organization",
        security,
        response: {
          ...errors,
          200: {
            type: "object",
            required: ["items"],
            properties: {
              items: { type: "array", items: scimTokenResponseSchema },
            },
          },
        },
      },
    },
    listScimTokensHandler,
  );

  app.post(
    PREFIX,
    {
      ...strict,
      schema: {
        tags,
        summary: "Create a SCIM token. The secret is returned only here.",
        security,
        response: { ...errors, 201: createdScimTokenResponseSchema },
      },
    },
    createScimTokenHandler,
  );

  app.post(
    `${PREFIX}/:id/revoke`,
    {
      ...strict,
      schema: {
        tags,
        summary: "Revoke a SCIM token",
        security,
        params: {
          type: "object",
          required: ["id"],
          properties: { id: idParam },
        },
        response: { ...errors, 200: scimTokenResponseSchema },
      },
    },
    revokeScimTokenHandler,
  );

  done();
};
