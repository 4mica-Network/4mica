import {
  listScimGroupsHandler,
  updateScimGroupHandler,
} from "@controllers/scim-groups/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  errorResponseSchema,
  idParam,
  limitedResponses,
} from "./schema-fragments";

const date = { type: "string", format: "date-time" } as const;
const roles = ["OWNER", "ADMIN", "DEVELOPER", "VIEWER", "FINANCE"];

const scimGroupResponseSchema = {
  type: "object",
  required: ["id", "displayName", "priority", "memberCount"],
  properties: {
    id: { type: "string" },
    displayName: { type: "string" },
    externalId: { type: "string", nullable: true },
    role: { type: "string", enum: roles, nullable: true },
    customRole: {
      type: "object",
      nullable: true,
      properties: { id: { type: "string" }, name: { type: "string" } },
    },
    priority: { type: "integer" },
    memberCount: { type: "integer" },
    createdAt: date,
    updatedAt: date,
  },
} as const;

const PREFIX = "/me/organization/scim-groups";
const tags = ["organizations"];
const security = [{ bearerAuth: [] }];

const errors = {
  ...limitedResponses,
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
};

export const scimGroupRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  app.get(
    PREFIX,
    {
      ...base,
      schema: {
        tags,
        summary:
          "Groups pushed by the identity provider and their role mapping",
        security,
        response: {
          ...errors,
          200: {
            type: "object",
            required: ["items"],
            properties: {
              items: { type: "array", items: scimGroupResponseSchema },
            },
          },
        },
      },
    },
    listScimGroupsHandler,
  );

  app.patch(
    `${PREFIX}/:id`,
    {
      onRequest: base.onRequest,
      preHandler: [...base.preHandler, sensitiveRateLimit(app)],
      schema: {
        tags,
        summary: "Map a SCIM group to a role or custom role",
        security,
        params: {
          type: "object",
          required: ["id"],
          properties: { id: idParam },
        },
        response: { ...errors, 200: scimGroupResponseSchema },
      },
    },
    updateScimGroupHandler,
  );

  done();
};
