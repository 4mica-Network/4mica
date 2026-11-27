import { ORG_ROLES } from "@controllers/organizations/schema";
import {
  createSsoConnectionHandler,
  deleteSsoConnectionHandler,
  listSsoConnectionsHandler,
  updateSsoConnectionHandler,
} from "@controllers/sso/index";
import { SSO_PROVIDERS } from "@controllers/sso/schema";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  approvalRequiredResponseSchema,
  errorResponseSchema,
  idParam,
  limitedResponses,
} from "./schema-fragments";

const str = { type: "string" } as const;
const nullStr = { type: "string", nullable: true } as const;
const bool = { type: "boolean" } as const;

const connectionSchema = {
  type: "object",
  required: [
    "id",
    "domainId",
    "domain",
    "provider",
    "name",
    "active",
    "enforced",
    "jitProvisioning",
    "defaultRole",
    "serviceProvider",
  ],
  properties: {
    id: str,
    domainId: str,
    domain: str,
    provider: { type: "string", enum: SSO_PROVIDERS },
    name: str,
    active: bool,
    enforced: bool,
    jitProvisioning: bool,
    defaultRole: { type: "string", enum: ORG_ROLES },
    idpEntityId: nullStr,
    idpSsoUrl: nullStr,
    idpMetadataUrl: nullStr,
    serviceProvider: {
      type: "object",
      nullable: true,
      required: ["acsUrl", "entityId", "metadataUrl"],
      properties: { acsUrl: str, entityId: str, metadataUrl: str },
    },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const errorSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    domain: str,
    reauthWithinMinutes: { type: "integer" },
  },
} as const;

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
} as const;

const PREFIX = "/me/organization/sso";
const tags = ["sso"];
const security = [{ bearerAuth: [] }];

const errors = {
  ...limitedResponses,
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
  502: errorSchema,
};

export const ssoRoutes: FastifyPluginCallback = (app, _opts, done) => {
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
        summary: "Single sign-on connections of this organization",
        security,
        response: {
          ...errors,
          200: {
            type: "object",
            required: ["items"],
            properties: { items: { type: "array", items: connectionSchema } },
          },
        },
      },
    },
    listSsoConnectionsHandler,
  );

  app.post(
    PREFIX,
    {
      ...strict,
      schema: {
        tags,
        summary:
          "Create an inactive SAML connection for a verified domain. The certificate is never returned.",
        security,
        response: {
          ...errors,
          201: connectionSchema,
          202: approvalRequiredResponseSchema,
        },
      },
    },
    createSsoConnectionHandler,
  );

  app.patch(
    `${PREFIX}/:id`,
    {
      ...strict,
      schema: {
        tags,
        summary: "Update, activate or enforce a SAML connection",
        security,
        params: idParamSchema,
        response: {
          ...errors,
          200: connectionSchema,
          202: approvalRequiredResponseSchema,
        },
      },
    },
    updateSsoConnectionHandler,
  );

  app.delete(
    `${PREFIX}/:id`,
    {
      ...strict,
      schema: {
        tags,
        summary: "Delete a SAML connection",
        security,
        params: idParamSchema,
        response: { ...errors, 204: { type: "null" } },
      },
    },
    deleteSsoConnectionHandler,
  );

  done();
};
