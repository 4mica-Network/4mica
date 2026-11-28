import { onlyBoundOrganization } from "@auth/cli-token";
import { PERMISSIONS } from "@auth/permissions";
import {
  acceptInvitationHandler,
  createInvitationsHandler,
  createOrganizationHandler,
  declineInvitationHandler,
  deleteOrganizationHandler,
  exportAuditLogsHandler,
  getOrganizationHandler,
  leaveOrganizationHandler,
  listAuditLogsHandler,
  listInvitationsHandler,
  listMembersHandler,
  listOrganizationsHandler,
  previewInvitationHandler,
  publicInvitationPreviewHandler,
  reactivateMemberHandler,
  removeMemberHandler,
  resendInvitationHandler,
  revokeInvitationHandler,
  revokeMemberSessionsHandler,
  suspendMemberHandler,
  transferOwnershipHandler,
  updateMemberHandler,
  updateOrganizationHandler,
} from "@controllers/organizations/index";
import {
  MEMBERSHIP_SOURCES,
  ORG_ROLES,
} from "@controllers/organizations/schema";
import {
  publicSensitiveRateLimit,
  sensitiveRateLimit,
} from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { cliGuards, guards } from "./guards";
import {
  approvalRequiredResponseSchema,
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
    customRole: {
      type: ["object", "null"],
      properties: { id: str, name: str },
    },
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
    customRole: {
      type: ["object", "null"],
      properties: { id: str, name: str },
    },
    source: { type: ["string", "null"], enum: [...MEMBERSHIP_SOURCES, null] },
    suspendedAt: { type: ["string", "null"], format: "date-time" },
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

const publicInvitationPreviewSchema = {
  type: "object",
  required: ["organization", "invitedBy", "emailHint", "expiresAt"],
  additionalProperties: false,
  properties: {
    organization: {
      type: "object",
      required: ["name", "avatarUrl"],
      additionalProperties: false,
      properties: { name: str, avatarUrl: nullableStr },
    },
    invitedBy: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: { name: str },
    },
    emailHint: str,
    expiresAt: dateTime,
  },
} as const;

const publicTokenParams = {
  type: "object",
  required: ["token"],
  properties: {
    token: {
      type: "string",
      pattern: "^4mica_inv_[A-Za-z0-9_-]{16,118}$",
    },
  },
} as const;

const auditLogFilters = {
  from: { type: "string", maxLength: 40 },
  to: { type: "string", maxLength: 40 },
  action: { type: "string", maxLength: 64 },
  actionPrefix: { type: "string", maxLength: 64 },
  actorUserId: { type: "string", maxLength: 64 },
  actorApiKeyId: { type: "string", maxLength: 64 },
  targetType: { type: "string", maxLength: 64 },
  targetId: { type: "string", maxLength: 64 },
  projectId: { type: "string", maxLength: 64 },
  q: { type: "string", maxLength: 100 },
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
          projectId: nullableStr,
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
  503: errorSchema,
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
      schema: doc("Transfer ownership of the active organization", {
        ...empty,
        202: approvalRequiredResponseSchema,
      }),
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
        ...doc("Change a member's role or give them a custom role", {
          200: memberSchema,
          202: approvalRequiredResponseSchema,
        }),
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

  app.post(
    "/me/organization/members/:userId/suspend",
    {
      ...strict,
      schema: {
        ...doc("Suspend a member", { 200: memberSchema }),
        description:
          "Needs `members.manage` and a recent sign-in. The member keeps their seat but can reach nothing in this organization, and their CLI sessions bound to it are revoked. You cannot suspend yourself or the last active owner.",
        params: userIdParams,
      },
    },
    suspendMemberHandler,
  );

  app.post(
    "/me/organization/members/:userId/reactivate",
    {
      ...strict,
      schema: {
        ...doc("Lift a member's suspension", { 200: memberSchema }),
        params: userIdParams,
      },
    },
    reactivateMemberHandler,
  );

  app.post(
    "/me/organization/members/:userId/sessions/revoke",
    {
      ...strict,
      schema: {
        ...doc("Sign a member out of every device", {
          200: {
            type: "object",
            required: ["revoked"],
            properties: { revoked: { type: "integer" } },
          },
        }),
        description:
          "Needs `members.manage` and a recent sign-in. Only for members whose primary email is on one of this organization's verified domains; anyone else answers 403 `identity_not_managed`.",
        params: userIdParams,
      },
    },
    revokeMemberSessionsHandler,
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
      schema: doc("Invite people by email", {
        201: listOf(invitationSchema),
        202: approvalRequiredResponseSchema,
      }),
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
            ...auditLogFilters,
          },
        },
      },
    },
    listAuditLogsHandler,
  );

  app.get(
    "/me/organization/audit-logs/export.csv",
    {
      ...base,
      schema: {
        ...doc("Export the active organization's audit log as CSV", {}),
        description:
          "Needs both `audit.read` and `reports.export`. Takes the same filters as the list. Returns `text/csv` as an attachment, newest first: RFC 4180 quoting, a header row, and any cell that starts with `=`, `+`, `-` or `@` prefixed with a single quote. At most 50,000 rows; `X-Truncated: true` says the export was cut short. The export itself is recorded as `report.exported`.",
        querystring: { type: "object", properties: auditLogFilters },
      },
    },
    exportAuditLogsHandler,
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

  app.get(
    "/v1/invitations/:token/preview",
    {
      preHandler: [publicSensitiveRateLimit(app)],
      schema: {
        tags: ["organizations"],
        summary: "Preview an invitation before signing in",
        description:
          "Unauthenticated by design: the token is the credential. Returns only the organization's name and avatar, the inviter's name, a masked hint of the invited address, and the expiry.",
        params: publicTokenParams,
        response: { ...errors, 200: publicInvitationPreviewSchema },
      },
    },
    publicInvitationPreviewHandler,
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
