import { PROJECT_PERMISSIONS } from "@auth/permissions";
import {
  archiveProjectHandler,
  createProjectHandler,
  deleteProjectHandler,
  getProjectHandler,
  listProjectMembersHandler,
  listProjectsHandler,
  moveResourcesHandler,
  removeProjectMemberHandler,
  setProjectMemberHandler,
  unarchiveProjectHandler,
  updateProjectHandler,
} from "@controllers/projects/index";
import { MOVABLE_KINDS, PROJECT_ROLES } from "@controllers/projects/schema";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { cliGuards, guards } from "./guards";
import {
  errorResponseSchema,
  idParam,
  limitedResponses,
} from "./schema-fragments";

const str = { type: "string" } as const;
const nullableStr = { type: ["string", "null"] } as const;
const bool = { type: "boolean" } as const;
const projectRole = { type: "string", enum: PROJECT_ROLES } as const;
const permissionList = {
  type: "array",
  items: { type: "string", enum: PROJECT_PERMISSIONS },
} as const;

const errorSchema = {
  ...errorResponseSchema,
  properties: { ...errorResponseSchema.properties, permission: str },
} as const;

const projectSchema = {
  type: "object",
  properties: {
    id: str,
    slug: str,
    name: str,
    description: nullableStr,
    isDefault: bool,
    restricted: bool,
    restrictProduction: bool,
    archived: bool,
    role: projectRole,
    permissions: {
      type: "object",
      properties: { SANDBOX: permissionList, PRODUCTION: permissionList },
    },
    environments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: str,
          kind: { type: "string", enum: ["SANDBOX", "PRODUCTION"] },
        },
      },
    },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const projectMemberSchema = {
  type: "object",
  properties: {
    userId: str,
    name: str,
    username: nullableStr,
    email: nullableStr,
    avatarUrl: nullableStr,
    orgRole: {
      type: "string",
      enum: ["OWNER", "ADMIN", "DEVELOPER", "VIEWER"],
    },
    projectRole: { type: ["string", "null"], enum: [...PROJECT_ROLES, null] },
    effectiveRole: {
      type: ["string", "null"],
      enum: [...PROJECT_ROLES, null],
    },
  },
} as const;

const errors = {
  ...limitedResponses,
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
} as const;

const doc = (summary: string, response: Record<number, unknown>) => ({
  tags: ["projects"],
  summary,
  security: [{ bearerAuth: [] }],
  response: { ...errors, ...response },
});

const userIdParams = {
  type: "object",
  required: ["userId"],
  properties: { userId: idParam },
} as const;

export const projectRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);
  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  app.get(
    "/me/projects",
    {
      ...cliGuards(app, "account:read"),
      schema: {
        ...doc("List the projects the caller can see", {
          200: {
            type: "object",
            properties: { items: { type: "array", items: projectSchema } },
          },
        }),
        security: [{ bearerAuth: [] }, { cliTokenAuth: [] }],
      },
    },
    listProjectsHandler,
  );

  app.post(
    "/me/projects",
    {
      ...strict,
      schema: doc("Create a project", { 201: projectSchema }),
    },
    createProjectHandler,
  );

  app.get(
    "/me/project",
    { ...base, schema: doc("The active project", { 200: projectSchema }) },
    getProjectHandler,
  );

  app.patch(
    "/me/project",
    {
      ...strict,
      schema: doc("Change the active project's settings", {
        200: projectSchema,
      }),
    },
    updateProjectHandler,
  );

  app.post(
    "/me/project/archive",
    {
      ...strict,
      schema: doc("Archive the active project", { 200: projectSchema }),
    },
    archiveProjectHandler,
  );

  app.post(
    "/me/project/unarchive",
    {
      ...strict,
      schema: doc("Unarchive the active project", { 200: projectSchema }),
    },
    unarchiveProjectHandler,
  );

  app.delete(
    "/me/project",
    {
      ...strict,
      schema: doc("Delete the active project", { 204: { type: "null" } }),
    },
    deleteProjectHandler,
  );

  app.get(
    "/me/project/members",
    {
      ...base,
      schema: doc("Who can reach the active project, and how", {
        200: {
          type: "object",
          properties: {
            items: { type: "array", items: projectMemberSchema },
          },
        },
      }),
    },
    listProjectMembersHandler,
  );

  app.put(
    "/me/project/members/:userId",
    {
      ...strict,
      schema: {
        ...doc("Give an org member a role on the active project", {
          200: projectMemberSchema,
        }),
        params: userIdParams,
      },
    },
    setProjectMemberHandler,
  );

  app.delete(
    "/me/project/members/:userId",
    {
      ...strict,
      schema: {
        ...doc("Remove a member's explicit role on the active project", {
          204: { type: "null" },
        }),
        params: userIdParams,
      },
    },
    removeProjectMemberHandler,
  );

  app.post(
    "/me/project/move",
    {
      ...strict,
      schema: {
        ...doc("Move resources to another project", {
          200: {
            type: "object",
            properties: {
              moved: { type: "array", items: str },
              notFound: { type: "array", items: str },
            },
          },
        }),
        body: {
          type: "object",
          properties: {
            kind: { type: "string", enum: MOVABLE_KINDS },
            ids: { type: "array", items: str },
            targetProjectId: str,
          },
        },
      },
    },
    moveResourcesHandler,
  );

  done();
};
