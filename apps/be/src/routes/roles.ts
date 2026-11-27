import { ASSIGNABLE_PERMISSIONS } from "@auth/permissions";
import {
  createRoleHandler,
  deleteRoleHandler,
  listRolesHandler,
  updateRoleHandler,
} from "@controllers/roles/index";
import { PROJECT_ROLES } from "@controllers/roles/schema";
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
const dateTime = { type: "string", format: "date-time" } as const;
const permission = { type: "string", enum: ASSIGNABLE_PERMISSIONS } as const;

const errorSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    reauthWithinMinutes: { type: "integer" },
  },
} as const;

const roleSchema = {
  type: "object",
  required: ["id", "name", "permissions", "projectRole", "memberCount"],
  properties: {
    id: str,
    name: str,
    description: { type: ["string", "null"] },
    permissions: { type: "array", items: permission },
    projectRole: { type: "string", enum: PROJECT_ROLES },
    memberCount: { type: "integer" },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

const idParams = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
} as const;

const doc = (summary: string, response: Record<number, unknown>) => ({
  tags: ["organizations"],
  summary,
  security: [{ bearerAuth: [] }],
  response: {
    ...limitedResponses,
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    409: errorSchema,
    ...response,
  },
});

export const roleRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);
  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  app.get(
    "/me/organization/roles",
    {
      ...base,
      schema: doc("List the organization's custom roles", {
        200: {
          type: "object",
          required: ["items", "assignablePermissions"],
          properties: {
            items: { type: "array", items: roleSchema },
            assignablePermissions: { type: "array", items: permission },
          },
        },
      }),
    },
    listRolesHandler,
  );

  app.post(
    "/me/organization/roles",
    {
      ...strict,
      schema: doc("Create a custom role", { 201: roleSchema }),
    },
    createRoleHandler,
  );

  app.patch(
    "/me/organization/roles/:id",
    {
      ...strict,
      schema: {
        ...doc("Change a custom role", {
          200: roleSchema,
          202: approvalRequiredResponseSchema,
        }),
        params: idParams,
      },
    },
    updateRoleHandler,
  );

  app.delete(
    "/me/organization/roles/:id",
    {
      ...strict,
      schema: {
        ...doc("Delete a custom role; its members fall back to viewer", {
          204: { type: "null" },
        }),
        params: idParams,
      },
    },
    deleteRoleHandler,
  );

  done();
};
