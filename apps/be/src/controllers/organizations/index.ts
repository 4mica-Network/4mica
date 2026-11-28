import type { OrgRole } from "@4mica/db";
import { permissionsFor, ROLE_PERMISSIONS } from "@auth/permissions";
import { requireRecentAuth } from "@auth/security";
import type { Tenant } from "@auth/tenant";
import { config } from "@config/index";
import { requireApproval } from "@controllers/approvals/gate";
import {
  AUDIT_EXPORT_HEADER,
  exportAuditLogs,
  listAuditLogs,
} from "@controllers/audit/repository";
import { ensureIdentityMemberships } from "@controllers/domains/membership";
import { rangeEnd, rangeStart } from "@controllers/finance/schema";
import {
  cannotGrant,
  holdsGovernedPermission,
  ungrantable,
} from "@controllers/roles/grants";
import { findRole } from "@controllers/roles/repository";
import {
  audit,
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
  requireUserId,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import { clerk } from "@services/clerk";
import { getClerkUser, primaryEmailDomain } from "@services/clerk-users";
import { CSV_ROW_LIMIT, sendCsv } from "@utils/csv";
import { isUniqueViolation } from "@utils/prisma-errors";
import { generateInvitationToken, hashSecret } from "@utils/secrets";
import type { FastifyReply, FastifyRequest, RouteHandler } from "fastify";
import {
  acceptInvitation,
  assignCustomRole,
  changeMemberRole,
  createInvitations,
  createOrganization,
  declineInvitation,
  existingMemberEmails,
  findInvitationByTokenHash,
  findMemberIdentity,
  findMemberRole,
  findOpenInvitation,
  getOrganization,
  handleTaken,
  type InvitationByToken,
  isVerifiedDomainOf,
  listMembers,
  listOrganizationsFor,
  listPendingInvitations,
  type MembershipChange,
  type OrganizationRow,
  reissueInvitation,
  removeMember,
  revokeInvitation,
  setMemberSuspension,
  softDeleteOrganization,
  transferOwnership,
  updateOrganization,
  verifiedEmailOf,
} from "./repository";
import {
  CreateOrganizationSchema,
  ExportAuditLogsQuerySchema,
  GOVERNED_ROLES,
  INVITATION_TTL_DAYS,
  InviteMembersSchema,
  ListAuditLogsQuerySchema,
  TransferOwnershipSchema,
  UpdateMemberSchema,
  UpdateOrganizationSchema,
} from "./schema";

const DAY_MS = 86_400_000;
const SUMMARY_MAX = 280;

const isGovernedRole = (role: OrgRole) => GOVERNED_ROLES.includes(role);

const roleName = (role: OrgRole) => role.toLowerCase();

const summary = ({ custom, ...org }: OrganizationRow) => ({
  ...org,
  permissions: permissionsFor({ role: org.role, custom }),
});

const exceedsActor = (tenant: Tenant, role: OrgRole) =>
  tenant.custom ? ungrantable(tenant, [...ROLE_PERMISSIONS[role]]) : [];

const actor = (request: FastifyRequest, userId: string) => ({
  actorUserId: userId,
  ip: request.ip,
});

const handleTakenReply = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "handle_taken",
    message: "That handle is already taken.",
    issues: [{ path: "handle", message: "is already taken" }],
  });

const personalOrganization = (reply: FastifyReply, message: string) =>
  reply.code(400).send({ error: "personal_organization", message });

const membershipError = (
  reply: FastifyReply,
  result: Extract<MembershipChange, { ok: false }>,
) => {
  switch (result.reason) {
    case "not_found":
      return notFound(reply, "member");
    case "last_owner":
      return reply.code(409).send({
        error: "last_owner",
        message:
          "An organization needs at least one owner. Make someone else an owner first.",
      });
    case "owner_only":
      return reply.code(403).send({
        error: "forbidden",
        message: "Only an owner can grant, change or remove the owner role.",
        permission: "org.transfer",
      });
    case "owner_custom_role":
      return reply.code(409).send({
        error: "owner_custom_role",
        message:
          "Owners cannot be given a custom role. Change them to another role first.",
      });
  }
};

const invitationUnavailable = (reply: FastifyReply) =>
  reply.code(410).send({
    error: "invitation_unavailable",
    message: "This invitation has expired or is no longer valid.",
  });

const isOpen = (invitation: InvitationByToken) =>
  invitation.acceptedAt === null &&
  invitation.declinedAt === null &&
  invitation.revokedAt === null &&
  invitation.organization.deletedAt === null &&
  invitation.expiresAt.getTime() > Date.now();

const inviteUrl = (token: string) =>
  `${config.appUrl}/invitations/${encodeURIComponent(token)}`;

const expiry = () => new Date(Date.now() + INVITATION_TTL_DAYS * DAY_MS);

const sendInvite = async (
  request: FastifyRequest,
  to: string,
  token: string,
  organizationName: string,
  invitedByName: string | null,
): Promise<void> => {
  const url = inviteUrl(token);
  if (config.isDev) {
    appLogger.info("Organization invitation link", { to, url });
  }

  const email = request.server.email;
  if (!email) {
    return;
  }

  try {
    await email.sendWorkspaceInvite({
      to,
      workspaceName: organizationName,
      inviteUrl: url,
      invitedByName: invitedByName ?? undefined,
      expiresInDays: INVITATION_TTL_DAYS,
    });
  } catch (error) {
    appLogger.error("Invitation email failed", { to, error });
  }
};

const activeOrganization = async (
  reply: FastifyReply,
  tenant: Tenant,
): Promise<OrganizationRow | null> => {
  const org = await getOrganization(tenant.orgId, tenant.userId);
  if (!org) {
    notFound(reply, "organization");
  }
  return org;
};

export const listOrganizationsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  await ensureIdentityMemberships(request, userId);
  const { items, defaultOrganizationId } = await listOrganizationsFor(userId);
  const fallback = items.find((org) => org.personal) ?? items[0];
  const defaultId =
    items.find((org) => org.id === defaultOrganizationId)?.id ??
    fallback?.id ??
    null;

  return reply.send({ items: items.map(summary), defaultId });
};

export const createOrganizationHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CreateOrganizationSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if (await handleTaken(parsed.data.handle)) {
    return handleTakenReply(reply);
  }

  try {
    const org = await createOrganization(
      userId,
      parsed.data,
      actor(request, userId),
    );
    return reply.code(201).send(summary(org));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return handleTakenReply(reply);
    }
    throw error;
  }
};

export const getOrganizationHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "resources.read");
  if (!tenant) {
    return reply;
  }

  const org = await activeOrganization(reply, tenant);
  return org ? reply.send(summary(org)) : reply;
};

export const updateOrganizationHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "org.update");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(UpdateOrganizationSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { name, handle } = parsed.data;
  if (handle !== undefined && tenant.personal) {
    return personalOrganization(
      reply,
      "A personal workspace's handle is your username. Change it from your profile.",
    );
  }

  if (handle !== undefined && (await handleTaken(handle, tenant.orgId))) {
    return handleTakenReply(reply);
  }

  try {
    await updateOrganization(
      tenant.orgId,
      {
        ...(name !== undefined ? { name } : {}),
        ...(handle !== undefined ? { handle } : {}),
      },
      actor(request, tenant.userId),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return handleTakenReply(reply);
    }
    throw error;
  }

  const org = await activeOrganization(reply, tenant);
  return org ? reply.send(summary(org)) : reply;
};

export const deleteOrganizationHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "org.delete");
  if (!tenant || !(await requireRecentAuth(request, reply, tenant))) {
    return reply;
  }

  if (tenant.personal) {
    return personalOrganization(
      reply,
      "A personal workspace cannot be deleted.",
    );
  }

  await softDeleteOrganization(tenant.orgId, actor(request, tenant.userId));
  appLogger.info("Organization deleted", {
    userId: tenant.userId,
    orgId: tenant.orgId,
  });
  return reply.code(204).send();
};

export const leaveOrganizationHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "resources.read");
  if (!tenant) {
    return reply;
  }

  if (tenant.personal) {
    return personalOrganization(
      reply,
      "You cannot leave your personal workspace.",
    );
  }

  const result = await removeMember(tenant.orgId, null, tenant.userId, {
    ...actor(request, tenant.userId),
    action: "member.left",
  });
  return result.ok ? reply.code(204).send() : membershipError(reply, result);
};

export const transferOwnershipHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "org.transfer");
  if (!tenant || !(await requireRecentAuth(request, reply, tenant))) {
    return reply;
  }

  if (tenant.personal) {
    return personalOrganization(
      reply,
      "A personal workspace cannot change hands.",
    );
  }

  const parsed = parseBody(TransferOwnershipSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const target =
    parsed.data.userId === tenant.userId
      ? null
      : await findMemberRole(tenant.orgId, parsed.data.userId);
  if (!target) {
    return notFound(reply, "member");
  }

  const gate = await requireApproval(
    request,
    reply,
    tenant,
    "member.role_grant",
    { kind: "transfer", userId: parsed.data.userId },
    `Transfer ownership to ${target.user.name}`.slice(0, SUMMARY_MAX),
  );
  if (!gate.proceed) {
    return reply;
  }

  const result = await transferOwnership(
    tenant.orgId,
    tenant.userId,
    parsed.data.userId,
    actor(request, tenant.userId),
  );
  return result.ok ? reply.code(204).send() : membershipError(reply, result);
};

export const listMembersHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "resources.read");
  if (!tenant) {
    return reply;
  }

  return reply.send({ items: await listMembers(tenant.orgId) });
};

export const updateMemberHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "members.manage");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(UpdateMemberSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { userId } = request.params as { userId: string };
  const { role, customRoleId } = parsed.data;

  if (customRoleId !== undefined) {
    return assignCustomRoleTo(request, reply, tenant, userId, customRoleId);
  }
  if (role === undefined) {
    return reply;
  }

  const missing = exceedsActor(tenant, role);
  if (missing.length > 0) {
    return cannotGrant(reply, missing);
  }

  if (isGovernedRole(role)) {
    const current = await findMemberRole(tenant.orgId, userId);
    if (!current) {
      return notFound(reply, "member");
    }
    if (
      (role === "OWNER" || current.role === "OWNER") &&
      tenant.role !== "OWNER"
    ) {
      return membershipError(reply, { ok: false, reason: "owner_only" });
    }
    if (current.role !== role || current.customRoleId) {
      const gate = await requireApproval(
        request,
        reply,
        tenant,
        "member.role_grant",
        { kind: "role_change", userId, role },
        `Make ${current.user.name} ${roleName(role)}`.slice(0, SUMMARY_MAX),
      );
      if (!gate.proceed) {
        return reply;
      }
    }
  }

  const result = await changeMemberRole(
    tenant.orgId,
    tenant.role,
    userId,
    role,
    actor(request, tenant.userId),
  );
  return result.ok ? reply.send(result.member) : membershipError(reply, result);
};

const assignCustomRoleTo = async (
  request: FastifyRequest,
  reply: FastifyReply,
  tenant: Tenant,
  userId: string,
  customRoleId: string,
) => {
  if (!(await requireRecentAuth(request, reply, tenant))) {
    return reply;
  }

  const customRole = await findRole(tenant.orgId, customRoleId);
  if (!customRole) {
    return notFound(reply, "role");
  }

  const current = await findMemberRole(tenant.orgId, userId);
  if (!current) {
    return notFound(reply, "member");
  }
  if (current.role === "OWNER") {
    return membershipError(reply, { ok: false, reason: "owner_custom_role" });
  }

  const missing = ungrantable(tenant, customRole.permissions);
  if (missing.length > 0) {
    return cannotGrant(reply, missing);
  }

  if (
    current.customRoleId !== customRole.id &&
    holdsGovernedPermission(customRole.permissions)
  ) {
    const gate = await requireApproval(
      request,
      reply,
      tenant,
      "member.role_grant",
      { kind: "custom_role", userId, customRoleId: customRole.id },
      `Give ${current.user.name} the ${customRole.name} role`.slice(
        0,
        SUMMARY_MAX,
      ),
    );
    if (!gate.proceed) {
      return reply;
    }
  }

  const result = await assignCustomRole(
    tenant.orgId,
    userId,
    customRole,
    actor(request, tenant.userId),
  );
  return result.ok ? reply.send(result.member) : membershipError(reply, result);
};

export const removeMemberHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "members.manage");
  if (!tenant) {
    return reply;
  }

  const { userId } = request.params as { userId: string };
  const result = await removeMember(tenant.orgId, tenant.role, userId, {
    ...actor(request, tenant.userId),
    action: userId === tenant.userId ? "member.left" : "member.removed",
  });
  return result.ok ? reply.code(204).send() : membershipError(reply, result);
};

const suspensionHandler =
  (suspend: boolean): RouteHandler =>
  async (request, reply) => {
    const tenant = await requireTenant(request, reply, "members.manage");
    if (!tenant) {
      return reply;
    }

    if (tenant.personal) {
      return personalOrganization(
        reply,
        "A personal workspace has a single member.",
      );
    }

    const { userId } = request.params as { userId: string };
    if (suspend && userId === tenant.userId) {
      return reply.code(409).send({
        error: "cannot_suspend_self",
        message: "You cannot suspend yourself.",
      });
    }

    if (!(await requireRecentAuth(request, reply, tenant))) {
      return reply;
    }

    const result = await setMemberSuspension(
      tenant.orgId,
      tenant.role,
      userId,
      suspend,
      actor(request, tenant.userId),
    );
    if (!result.ok) {
      return result.reason === "last_owner"
        ? reply.code(409).send({
            error: "last_owner",
            message:
              "An organization needs at least one active owner. Make someone else an owner first.",
          })
        : membershipError(reply, result);
    }

    appLogger.info(suspend ? "Member suspended" : "Member reactivated", {
      orgId: tenant.orgId,
      userId,
      actorUserId: tenant.userId,
      cliSessionsRevoked: result.cliSessionsRevoked,
    });
    return reply.send(result.member);
  };

export const suspendMemberHandler = suspensionHandler(true);
export const reactivateMemberHandler = suspensionHandler(false);

const SESSION_PAGE = 100;
const SESSION_PAGES_MAX = 10;

const revokeClerkSessions = async (clerkUserId: string): Promise<number> => {
  const ids: string[] = [];
  for (let pageIndex = 0; pageIndex < SESSION_PAGES_MAX; pageIndex++) {
    const page = await clerk.sessions.getSessionList({
      userId: clerkUserId,
      status: "active",
      limit: SESSION_PAGE,
      offset: pageIndex * SESSION_PAGE,
    });
    ids.push(...page.data.map((session) => session.id));
    if (page.data.length < SESSION_PAGE) {
      break;
    }
  }
  await Promise.all(ids.map((id) => clerk.sessions.revokeSession(id)));
  return ids.length;
};

export const revokeMemberSessionsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "members.manage");
  if (!tenant) {
    return reply;
  }

  if (tenant.personal) {
    return personalOrganization(
      reply,
      "A personal workspace does not manage identities.",
    );
  }

  if (!(await requireRecentAuth(request, reply, tenant))) {
    return reply;
  }

  const { userId } = request.params as { userId: string };
  const member = await findMemberIdentity(tenant.orgId, userId);
  if (!member) {
    return notFound(reply, "member");
  }

  const notManaged = () =>
    reply.code(403).send({
      error: "identity_not_managed",
      message:
        "This member's email is not on a verified domain of this organization, so their sign-ins are not yours to end.",
    });

  const { clerkUserId } = member.user;
  let domain: string | null;
  try {
    domain = primaryEmailDomain(await getClerkUser(clerkUserId));
  } catch (error) {
    appLogger.error("Could not load the member from Clerk", {
      orgId: tenant.orgId,
      userId,
      error,
    });
    return reply.code(503).send({
      error: "identity_unavailable",
      message: "The identity provider is unreachable. Retry shortly.",
    });
  }

  if (!domain || !(await isVerifiedDomainOf(tenant.orgId, domain))) {
    return notManaged();
  }

  let revoked: number;
  try {
    revoked = await revokeClerkSessions(clerkUserId);
  } catch (error) {
    appLogger.error("Could not revoke the member's sessions", {
      orgId: tenant.orgId,
      userId,
      error,
    });
    return reply.code(503).send({
      error: "identity_unavailable",
      message: "The identity provider is unreachable. Retry shortly.",
    });
  }

  await audit(request, tenant, {
    action: "member.sessions_revoked",
    targetType: "user",
    targetId: userId,
    metadata: { revoked, domain },
  });
  return reply.send({ revoked });
};

export const listInvitationsHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "members.manage");
  if (!tenant) {
    return reply;
  }

  return reply.send({ items: await listPendingInvitations(tenant.orgId) });
};

export const createInvitationsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "members.manage");
  if (!tenant) {
    return reply;
  }

  if (tenant.personal) {
    return personalOrganization(
      reply,
      "A personal workspace has a single member. Create an organization to invite people.",
    );
  }

  const parsed = parseBody(InviteMembersSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { emails, role } = parsed.data;
  if (role === "OWNER" && tenant.role !== "OWNER") {
    return membershipError(reply, { ok: false, reason: "owner_only" });
  }
  const missing = exceedsActor(tenant, role);
  if (missing.length > 0) {
    return cannotGrant(reply, missing);
  }

  const members = await existingMemberEmails(tenant.orgId, emails);
  const already = emails.filter((email) => members.has(email));
  if (already.length > 0) {
    return invalidBody(
      reply,
      already.map((email) => ({
        path: "emails",
        message: `${email} is already a member`,
      })),
    );
  }

  if (isGovernedRole(role)) {
    const invitees = [...emails].sort();
    const gate = await requireApproval(
      request,
      reply,
      tenant,
      "member.role_grant",
      { kind: "invitation", emails: invitees, role },
      (invitees.length === 1
        ? `Invite ${invitees[0]} as ${roleName(role)}`
        : `Invite ${invitees.length} people as ${roleName(role)}`
      ).slice(0, SUMMARY_MAX),
    );
    if (!gate.proceed) {
      return reply;
    }
  }

  const org = await activeOrganization(reply, tenant);
  if (!org) {
    return reply;
  }

  const tokens = emails.map((email) => ({
    email,
    secret: generateInvitationToken(),
  }));
  const created = await createInvitations(
    tenant.orgId,
    tenant.userId,
    role,
    tokens.map(({ email, secret }) => ({ email, tokenHash: secret.hash })),
    expiry(),
    actor(request, tenant.userId),
  );

  const inviter = request.user?.name ?? null;
  await Promise.all(
    tokens.map(({ email, secret }) =>
      sendInvite(request, email, secret.plaintext, org.name, inviter),
    ),
  );

  return reply.code(201).send({ items: created });
};

export const resendInvitationHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "members.manage");
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const invitation = await findOpenInvitation(tenant.orgId, id);
  if (!invitation) {
    return notFound(reply, "invitation");
  }

  const org = await activeOrganization(reply, tenant);
  if (!org) {
    return reply;
  }

  const secret = generateInvitationToken();
  const updated = await reissueInvitation(id, secret.hash, expiry());
  await sendInvite(
    request,
    invitation.email,
    secret.plaintext,
    org.name,
    request.user?.name ?? null,
  );

  return reply.send(updated);
};

export const revokeInvitationHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "members.manage");
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const revoked = await revokeInvitation(
    tenant.orgId,
    id,
    actor(request, tenant.userId),
  );
  return revoked ? reply.code(204).send() : notFound(reply, "invitation");
};

const invitationFromParams = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<InvitationByToken | null> => {
  const { token } = request.params as { token: string };
  const invitation = await findInvitationByTokenHash(hashSecret(token));
  if (!invitation) {
    notFound(reply, "invitation");
    return null;
  }
  if (!isOpen(invitation)) {
    invitationUnavailable(reply);
    return null;
  }
  return invitation;
};

export const previewInvitationHandler: RouteHandler = async (
  request,
  reply,
) => {
  if (!requireUserId(request, reply)) {
    return reply;
  }

  const invitation = await invitationFromParams(request, reply);
  if (!invitation) {
    return reply;
  }

  const { deletedAt: _deleted, ...organization } = invitation.organization;
  return reply.send({
    organization,
    email: invitation.email,
    role: invitation.role,
    invitedBy: invitation.invitedBy,
    expiresAt: invitation.expiresAt,
  });
};

const maskEmail = (email: string): string => {
  const at = email.lastIndexOf("@");
  if (at < 1) {
    return "***";
  }
  return `${email[0]}***${email.slice(at)}`;
};

export const publicInvitationPreviewHandler: RouteHandler = async (
  request,
  reply,
) => {
  const invitation = await invitationFromParams(request, reply);
  if (!invitation) {
    return reply;
  }

  return reply.send({
    organization: {
      name: invitation.organization.name,
      avatarUrl: invitation.organization.avatarUrl,
    },
    invitedBy: invitation.invitedBy?.name.trim()
      ? { name: invitation.invitedBy.name }
      : null,
    emailHint: maskEmail(invitation.email),
    expiresAt: invitation.expiresAt,
  });
};

const verifiedEmails = async (
  request: FastifyRequest,
  userId: string,
): Promise<Set<string>> => {
  const emails = new Set<string>();

  const row = await verifiedEmailOf(userId);
  if (row?.email && row.emailVerified) {
    emails.add(row.email.toLowerCase());
  }

  const clerkUserId = request.user?.clerkUserId;
  if (clerkUserId) {
    try {
      const clerkUser = await clerk.users.getUser(clerkUserId);
      for (const address of clerkUser.emailAddresses) {
        if (address.verification?.status === "verified") {
          emails.add(address.emailAddress.toLowerCase());
        }
      }
    } catch (error) {
      appLogger.warn("Could not read verified emails from Clerk", {
        userId,
        error,
      });
    }
  }

  return emails;
};

export const acceptInvitationHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const invitation = await invitationFromParams(request, reply);
  if (!invitation) {
    return reply;
  }

  const emails = await verifiedEmails(request, userId);
  if (!emails.has(invitation.email.toLowerCase())) {
    return reply.code(403).send({
      error: "invitation_email_mismatch",
      message: `This invitation was sent to ${invitation.email}. Sign in with that verified address to accept it.`,
    });
  }

  const org = await acceptInvitation(invitation, userId, {
    actorUserId: userId,
    ip: request.ip,
  });
  if (!org) {
    return invitationUnavailable(reply);
  }

  return reply.send({ organization: summary(org) });
};

export const declineInvitationHandler: RouteHandler = async (
  request,
  reply,
) => {
  if (!requireUserId(request, reply)) {
    return reply;
  }

  const invitation = await invitationFromParams(request, reply);
  if (!invitation) {
    return reply;
  }

  await declineInvitation(invitation.id);
  return reply.code(204).send();
};

export const listAuditLogsHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "audit.read");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(ListAuditLogsQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { from, to, ...rest } = parsed.data;
  const window = auditWindow(from, to);
  if (!window) {
    return invalidBody(reply, [{ path: "from", message: "must be before to" }]);
  }

  return reply.send(await listAuditLogs(tenant.orgId, { ...rest, ...window }));
};

const auditWindow = (
  from: string | undefined,
  to: string | undefined,
): { from?: Date; to?: Date } | null => {
  const window = {
    ...(from ? { from: rangeStart(from) } : {}),
    ...(to ? { to: rangeEnd(to) } : {}),
  };
  return window.from && window.to && window.from >= window.to ? null : window;
};

export const exportAuditLogsHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "audit.read");
  if (!tenant || !(await requireTenant(request, reply, "reports.export"))) {
    return reply;
  }

  const parsed = parseBody(ExportAuditLogsQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { from, to, ...rest } = parsed.data;
  const window = auditWindow(from, to);
  if (!window) {
    return invalidBody(reply, [{ path: "from", message: "must be before to" }]);
  }

  const filters = { ...rest, ...window };
  const { rows, truncated } = await exportAuditLogs(
    tenant.orgId,
    filters,
    CSV_ROW_LIMIT,
  );

  await audit(request, tenant, {
    action: "report.exported",
    targetType: "report",
    targetId: "audit_logs",
    metadata: {
      report: "audit_logs",
      filters: {
        ...rest,
        from: window.from?.toISOString() ?? null,
        to: window.to?.toISOString() ?? null,
      },
      rows: rows.length,
      truncated,
    },
  });

  return sendCsv(
    reply,
    `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
    AUDIT_EXPORT_HEADER,
    rows,
    truncated,
  );
};
