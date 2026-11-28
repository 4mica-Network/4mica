import {
  createServiceAccountHandler,
  createServiceAccountKeyHandler,
  deleteServiceAccountHandler,
  listServiceAccountKeysHandler,
  listServiceAccountsHandler,
  reactivateServiceAccountHandler,
  revokeServiceAccountKeyHandler,
  rotateServiceAccountKeyHandler,
  suspendServiceAccountHandler,
  updateServiceAccountHandler,
  updateServiceAccountKeyHandler,
} from "@controllers/service-accounts/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  apiKeyResponseSchema,
  approvalRequiredResponseSchema,
  errorResponseSchema,
  idParam,
  limitedResponses,
} from "./schema-fragments";

const nullStr = { type: "string", nullable: true } as const;
const date = { type: "string", format: "date-time" } as const;

const serviceAccountResponseSchema = {
  type: "object",
  required: ["id", "name", "keyCount"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    description: nullStr,
    suspendedAt: { ...date, nullable: true },
    createdAt: date,
    createdBy: {
      type: "object",
      nullable: true,
      properties: { id: { type: "string" }, name: { type: "string" } },
    },
    keyCount: { type: "integer" },
  },
} as const;

const serviceAccountListResponseSchema = {
  type: "object",
  required: ["items"],
  properties: {
    items: { type: "array", items: serviceAccountResponseSchema },
  },
} as const;

const keyListResponseSchema = {
  type: "object",
  required: ["items"],
  properties: { items: { type: "array", items: apiKeyResponseSchema } },
} as const;

const createdKeyResponseSchema = {
  ...apiKeyResponseSchema,
  required: [...apiKeyResponseSchema.required, "secret"],
  properties: {
    ...apiKeyResponseSchema.properties,
    secret: { type: "string" },
  },
} as const;

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
} as const;

const keyParamSchema = {
  type: "object",
  required: ["id", "keyId"],
  properties: { id: idParam, keyId: idParam },
} as const;

const forbiddenResponseSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    permission: { type: "string" },
  },
} as const;

const PREFIX = "/me/service-accounts";
const tags = ["service-accounts"];
const security = [{ bearerAuth: [] }];

const errors = {
  ...limitedResponses,
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: forbiddenResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
};

export const serviceAccountRoutes: FastifyPluginCallback = (
  app,
  _opts,
  done,
) => {
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
        summary: "Service accounts in the active project",
        security,
        response: { ...errors, 200: serviceAccountListResponseSchema },
      },
    },
    listServiceAccountsHandler,
  );

  app.post(
    PREFIX,
    {
      ...base,
      schema: {
        tags,
        summary: "Create a service account",
        security,
        response: { ...errors, 201: serviceAccountResponseSchema },
      },
    },
    createServiceAccountHandler,
  );

  app.patch(
    `${PREFIX}/:id`,
    {
      ...base,
      schema: {
        tags,
        summary: "Rename or describe a service account",
        security,
        params: idParamSchema,
        response: { ...errors, 200: serviceAccountResponseSchema },
      },
    },
    updateServiceAccountHandler,
  );

  app.post(
    `${PREFIX}/:id/suspend`,
    {
      ...base,
      schema: {
        tags,
        summary: "Suspend a service account. Its keys stop working.",
        security,
        params: idParamSchema,
        response: { ...errors, 200: serviceAccountResponseSchema },
      },
    },
    suspendServiceAccountHandler,
  );

  app.post(
    `${PREFIX}/:id/reactivate`,
    {
      ...base,
      schema: {
        tags,
        summary: "Reactivate a suspended service account",
        security,
        params: idParamSchema,
        response: { ...errors, 200: serviceAccountResponseSchema },
      },
    },
    reactivateServiceAccountHandler,
  );

  app.delete(
    `${PREFIX}/:id`,
    {
      ...strict,
      schema: {
        tags,
        summary: "Delete a service account and revoke its keys",
        security,
        params: idParamSchema,
        response: { ...errors, 204: { type: "null" } },
      },
    },
    deleteServiceAccountHandler,
  );

  app.get(
    `${PREFIX}/:id/keys`,
    {
      ...base,
      schema: {
        tags,
        summary: "A service account's keys in the active environment",
        security,
        params: idParamSchema,
        response: { ...errors, 200: keyListResponseSchema },
      },
    },
    listServiceAccountKeysHandler,
  );

  app.post(
    `${PREFIX}/:id/keys`,
    {
      ...strict,
      schema: {
        tags,
        summary:
          "Create a key for a service account. The secret is returned only here.",
        security,
        params: idParamSchema,
        response: {
          ...errors,
          201: createdKeyResponseSchema,
          202: approvalRequiredResponseSchema,
        },
      },
    },
    createServiceAccountKeyHandler,
  );

  app.patch(
    `${PREFIX}/:id/keys/:keyId`,
    {
      ...strict,
      schema: {
        tags,
        summary:
          "Rename a service account key or change the addresses it may be used from",
        security,
        params: keyParamSchema,
        response: { ...errors, 200: apiKeyResponseSchema },
      },
    },
    updateServiceAccountKeyHandler,
  );

  app.post(
    `${PREFIX}/:id/keys/:keyId/revoke`,
    {
      ...strict,
      schema: {
        tags,
        summary: "Revoke a service account key",
        security,
        params: keyParamSchema,
        response: { ...errors, 200: apiKeyResponseSchema },
      },
    },
    revokeServiceAccountKeyHandler,
  );

  app.post(
    `${PREFIX}/:id/keys/:keyId/rotate`,
    {
      ...strict,
      schema: {
        tags,
        summary:
          "Replace a key, optionally keeping the old one alive for a grace period",
        security,
        params: keyParamSchema,
        response: {
          ...errors,
          201: createdKeyResponseSchema,
          202: approvalRequiredResponseSchema,
        },
      },
    },
    rotateServiceAccountKeyHandler,
  );

  done();
};
