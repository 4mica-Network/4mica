import { onlyBoundOrganization } from "@auth/cli-token";
import { PERMISSIONS } from "@auth/permissions";
import {
  acceptInvitationHandler,
  createInvitationsHandler,
  createOrganizationHandler,
  declineInvitationHandler,
  deleteOrganizationHandler,
  getOrganizationHandler,
  leaveOrganizationHandler,
  listAuditLogsHandler,
  listInvitationsHandler,
  listMembersHandler,
  listOrganizationsHandler,
  previewInvitationHandler,
  removeMemberHandler,
  resendInvitationHandler,
  revokeInvitationHandler,
  transferOwnershipHandler,
  updateMemberHandler,
  updateOrganizationHandler,
} from "@controllers/organizations/index";
import { ORG_ROLES } from "@controllers/organizations/schema";
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
const dateTime = { type: "string", format: "date-time" } as const;
const role = { type: "string", enum: ORG_ROLES } as const;

const errorSchema = {
  ...errorResponseSchema,
  properties: { ...errorResponseSchema.properties, permission: str },
} as const;

const organizationSchema = {
  type: "object",
  required: ["id", "name", "personal", "role", "permissions"],
  properties: {
    id: str,
    handle: nullableStr,
    name: str,
    avatarUrl: nullableStr,
    personal: { type: "boolean" },
    role,
    permissions: {
      type: "array",
      items: { type: "string", enum: PERMISSIONS },
    },
    memberCount: { type: "integer" },
    createdAt: dateTime,
  },
} as const;

const memberSchema = {
  type: "object",
  properties: {
    userId: str,
    name: str,
    username: nullableStr,
    email: nullableStr,
    avatarUrl: nullableStr,
    role,
    joinedAt: dateTime,
  },
} as const;

const invitationSchema = {
  type: "object",
  properties: {
    id: str,
    email: str,
    role,
    invitedBy: {
      type: ["object", "null"],
      properties: { id: str, name: str },
    },
    expiresAt: dateTime,
    createdAt: dateTime,
    expired: { type: "boolean" },
  },
} as const;

const invitationPreviewSchema = {
  type: "object",
  properties: {
    organization: {
      type: "object",
      properties: {
        id: str,
        name: str,
        handle: nullableStr,
        avatarUrl: nullableStr,
      },
    },
    email: str,
    role,
    invitedBy: { type: ["object", "null"], properties: { name: str } },
    expiresAt: dateTime,
  },
} as const;

const auditLogListSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: str,
          action: str,
          targetType: nullableStr,
          targetId: nullableStr,
          metadata: {},
          ip: nullableStr,
          createdAt: dateTime,
          actorApiKeyId: nullableStr,
          actor: {
            type: ["object", "null"],
            properties: {
              id: str,
              name: str,
              username: nullableStr,
              avatarUrl: nullableStr,
            },
          },
        },
      },
    },
    nextCursor: nullableStr,
  },
} as const;

const listOf = (items: object) =>
  ({
    type: "object",
    properties: { items: { type: "array", items } },
  }) as const;

const userIdParams = {
  type: "object",
  required: ["userId"],
  properties: { userId: idParam },
} as const;

const idParams = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
} as const;

const tokenParams = {
  type: "object",
  required: ["token"],
  properties: { token: { type: "string", minLength: 16, maxLength: 128 } },
} as const;

const errors = {
  ...limitedResponses,
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
  410: errorSchema,
} as const;

const doc = (summary: string, response: Record<number, unknown>) => ({
  tags: ["organizations"],
  summary,
  security: [{ bearerAuth: [] }],
  response: { ...errors, ...response },
});

const empty = { 204: { type: "null" } } as const;

export const organizationRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);
  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  app.get(
    "/me/organizations",
    {
      ...cliGuards(app, "account:read"),
      preSerialization: onlyBoundOrganization,
      schema: {
        ...doc("List the organizations the caller belongs to", {
          200: {
            type: "object",
            properties: {
              items: { type: "array", items: organizationSchema },
              defaultId: nullableStr,
            },
          },
        }),
        security: [{ bearerAuth: [] }, { cliTokenAuth: [] }],
      },
    },
    listOrganizationsHandler,
  );

  app.post(
    "/me/organizations",
    {
      ...strict,
      schema: doc("Create an organization owned by the caller", {
        201: organizationSchema,
      }),
    },
    createOrganizationHandler,
  );

  app.get(
    "/me/organization",
    {
      ...base,
      schema: doc("The active organization", { 200: organizationSchema }),
    },
    getOrganizationHandler,
  );

  app.patch(
    "/me/organization",
    {
      ...strict,
      schema: doc("Rename the active organization or change its handle", {
        200: organizationSchema,
      }),
    },
    updateOrganizationHandler,
  );

  app.delete(
    "/me/organization",
    { ...strict, schema: doc("Delete the active organization", empty) },
    deleteOrganizationHandler,
  );

  app.post(
    "/me/organization/leave",
    { ...strict, schema: doc("Leave the active organization", empty) },
    leaveOrganizationHandler,
  );

  app.post(
    "/me/organization/transfer",
    {
      ...strict,
      schema: doc("Transfer ownership of the active organization", empty),
    },
    transferOwnershipHandler,
  );

  app.get(
    "/me/organization/members",
    {
      ...base,
      schema: doc("List the active organization's members", {
        200: listOf(memberSchema),
      }),
    },
    listMembersHandler,
  );

  app.patch(
    "/me/organization/members/:userId",
    {
      ...strict,
      schema: {
        ...doc("Change a member's role", { 200: memberSchema }),
        params: userIdParams,
      },
    },
    updateMemberHandler,
  );

  app.delete(
    "/me/organization/members/:userId",
    {
      ...strict,
      schema: { ...doc("Remove a member", empty), params: userIdParams },
    },
    removeMemberHandler,
  );

  app.get(
    "/me/organization/invitations",
    {
      ...base,
      schema: doc("List pending invitations", {
        200: listOf(invitationSchema),
      }),
    },
    listInvitationsHandler,
  );

  app.post(
    "/me/organization/invitations",
    {
      ...strict,
      schema: doc("Invite people by email", { 201: listOf(invitationSchema) }),
    },
    createInvitationsHandler,
  );

  app.post(
    "/me/organization/invitations/:id/resend",
    {
      ...strict,
      schema: {
        ...doc("Send an invitation again with a fresh link", {
          200: invitationSchema,
        }),
        params: idParams,
      },
    },
    resendInvitationHandler,
  );

  app.post(
    "/me/organization/invitations/:id/revoke",
    {
      ...strict,
      schema: { ...doc("Revoke an invitation", empty), params: idParams },
    },
    revokeInvitationHandler,
  );

  app.get(
    "/me/organization/audit-logs",
    {
      ...base,
      schema: {
        ...doc("The active organization's audit log", {
          200: auditLogListSchema,
        }),
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100 },
            cursor: str,
            action: { type: "string", maxLength: 64 },
          },
        },
      },
    },
    listAuditLogsHandler,
  );

  app.get(
    "/me/invitations/:token",
    {
      ...base,
      schema: {
        ...doc("Preview an invitation", { 200: invitationPreviewSchema }),
        params: tokenParams,
      },
    },
    previewInvitationHandler,
  );

  app.post(
    "/me/invitations/:token/accept",
    {
      ...strict,
      schema: {
        ...doc("Accept an invitation", {
          200: {
            type: "object",
            properties: { organization: organizationSchema },
          },
        }),
        params: tokenParams,
      },
    },
    acceptInvitationHandler,
  );

  app.post(
    "/me/invitations/:token/decline",
    {
      ...strict,
      schema: { ...doc("Decline an invitation", empty), params: tokenParams },
    },
    declineInvitationHandler,
  );

  done();
};
