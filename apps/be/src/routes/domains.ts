import {
  createDomainHandler,
  deleteDomainHandler,
  listDomainsHandler,
  updateDomainHandler,
  verifyDomainHandler,
} from "@controllers/domains/index";
import { JOIN_ROLES } from "@controllers/domains/schema";
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
const date = { type: "string", format: "date-time" } as const;
const nullDate = { ...date, nullable: true } as const;

const verificationRecordSchema = {
  type: "object",
  required: ["type", "name", "value"],
  properties: {
    type: { type: "string", enum: ["TXT"] },
    name: str,
    value: str,
  },
} as const;

const domainSchema = {
  type: "object",
  required: ["id", "domain", "verified", "verificationRecord", "autoJoin"],
  properties: {
    id: str,
    domain: str,
    verified: { type: "boolean" },
    verifiedAt: nullDate,
    verificationRecord: verificationRecordSchema,
    autoJoin: { type: "boolean" },
    autoJoinRole: {
      type: "string",
      enum: [...JOIN_ROLES, "OWNER"],
    },
    lastCheckedAt: nullDate,
    createdAt: date,
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

const unverifiedSchema = {
  ...errorSchema,
  properties: {
    ...errorSchema.properties,
    expected: verificationRecordSchema,
    found: { type: "array", items: str },
  },
} as const;

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
} as const;

const PREFIX = "/me/organization/domains";
const tags = ["domains"];
const security = [{ bearerAuth: [] }];

const errors = {
  ...limitedResponses,
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
};

export const domainRoutes: FastifyPluginCallback = (app, _opts, done) => {
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
        summary: "Domains this organization has claimed",
        security,
        response: {
          ...errors,
          200: {
            type: "object",
            required: ["items"],
            properties: { items: { type: "array", items: domainSchema } },
          },
        },
      },
    },
    listDomainsHandler,
  );

  app.post(
    PREFIX,
    {
      ...strict,
      schema: {
        tags,
        summary: "Claim a domain. Verify it with the returned TXT record.",
        security,
        response: { ...errors, 201: domainSchema },
      },
    },
    createDomainHandler,
  );

  app.post(
    `${PREFIX}/:id/verify`,
    {
      ...strict,
      schema: {
        tags,
        summary: "Check the domain's DNS TXT record",
        security,
        params: idParamSchema,
        response: { ...errors, 200: domainSchema, 422: unverifiedSchema },
      },
    },
    verifyDomainHandler,
  );

  app.patch(
    `${PREFIX}/:id`,
    {
      ...strict,
      schema: {
        tags,
        summary: "Change who joins automatically from this domain",
        security,
        params: idParamSchema,
        response: {
          ...errors,
          200: domainSchema,
          202: approvalRequiredResponseSchema,
        },
      },
    },
    updateDomainHandler,
  );

  app.delete(
    `${PREFIX}/:id`,
    {
      ...strict,
      schema: {
        tags,
        summary: "Remove a domain and its single sign-on connections",
        security,
        params: idParamSchema,
        response: { ...errors, 204: { type: "null" }, 502: errorSchema },
      },
    },
    deleteDomainHandler,
  );

  done();
};
