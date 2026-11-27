import { permissionsFor } from "@auth/permissions";
import type { Tenant } from "@auth/tenant";
import { config } from "@config/index";
import { listAuditLogs } from "@controllers/audit/repository";
import {
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
  requireUserId,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import { clerk } from "@services/clerk";
import { isUniqueViolation } from "@utils/prisma-errors";
import { generateInvitationToken, hashSecret } from "@utils/secrets";
import type { FastifyReply, FastifyRequest, RouteHandler } from "fastify";
import {
  acceptInvitation,
  changeMemberRole,
  createInvitations,
  createOrganization,
  declineInvitation,
  existingMemberEmails,
  findInvitationByTokenHash,
  findOpenInvitation,
  getOrganization,
  handleTaken,
  type InvitationByToken,
  listMembers,
  listOrganizationsFor,
  listPendingInvitations,
  type MembershipChange,
  type OrganizationRow,
  reissueInvitation,
  removeMember,
  revokeInvitation,
  softDeleteOrganization,
  transferOwnership,
  updateOrganization,
  verifiedEmailOf,
} from "./repository";
import {
  CreateOrganizationSchema,
  INVITATION_TTL_DAYS,
  InviteMembersSchema,
  ListAuditLogsQuerySchema,
  TransferOwnershipSchema,
  UpdateMemberSchema,
  UpdateOrganizationSchema,
} from "./schema";

const DAY_MS = 86_400_000;

const summary = (org: OrganizationRow) => ({
  ...org,
  permissions: permissionsFor(org.role),
});

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
  if (!tenant) {
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
  if (!tenant) {
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
  const result = await changeMemberRole(
    tenant.orgId,
    tenant.role,
    userId,
    parsed.data.role,
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

  return reply.send(await listAuditLogs(tenant.orgId, parsed.data));
};
