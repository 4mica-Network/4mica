import type { OrganizationRole } from "@stores/organization/type";
import type { PendingMeta } from "@stores/utils";
import actionTypes from "./actionTypes";
import type {
  AuditFilters,
  AuditLogItem,
  Member,
  PendingInvitation,
  RoleAssignment,
} from "./type";

export const teamPendingKeys = {
  member: (userId: string) => `member:${userId}`,
  invitation: (id: string) => `invitation:${id}`,
  invite: "inviteMembers",
} as const;

export const fetchMembers = () => ({
  type: actionTypes.FETCH_MEMBERS_REQUESTED,
});

export const fetchMembersPending = () => ({
  type: actionTypes.FETCH_MEMBERS_PENDING,
});

export const fetchMembersSucceeded = (items: Member[]) => ({
  type: actionTypes.FETCH_MEMBERS_SUCCEEDED,
  payload: { items },
});

export const fetchMembersFailed = (message: string) => ({
  type: actionTypes.FETCH_MEMBERS_FAILED,
  payload: { message },
});

export const updateMemberRole = (
  payload: { userId: string } & RoleAssignment,
) => ({
  type: actionTypes.UPDATE_MEMBER_ROLE_REQUESTED,
  payload,
  meta: { pendingKey: teamPendingKeys.member(payload.userId) },
});

export const updateMemberRoleSucceeded = (
  member: Member,
  meta: PendingMeta,
) => ({
  type: actionTypes.UPDATE_MEMBER_ROLE_SUCCEEDED,
  payload: member,
  meta,
});

export const removeMember = (payload: { userId: string }) => ({
  type: actionTypes.REMOVE_MEMBER_REQUESTED,
  payload,
  meta: { pendingKey: teamPendingKeys.member(payload.userId) },
});

export const removeMemberSucceeded = (userId: string, meta: PendingMeta) => ({
  type: actionTypes.REMOVE_MEMBER_SUCCEEDED,
  payload: { userId },
  meta,
});

export const suspendMember = (payload: {
  userId: string;
  suspended: boolean;
}) => ({
  type: actionTypes.SUSPEND_MEMBER_REQUESTED,
  payload,
  meta: { pendingKey: teamPendingKeys.member(payload.userId) },
});

export const suspendMemberSucceeded = (member: Member, meta: PendingMeta) => ({
  type: actionTypes.SUSPEND_MEMBER_SUCCEEDED,
  payload: member,
  meta,
});

export const revokeMemberSessions = (payload: { userId: string }) => ({
  type: actionTypes.REVOKE_MEMBER_SESSIONS_REQUESTED,
  payload,
  meta: { pendingKey: teamPendingKeys.member(payload.userId) },
});

export const revokeMemberSessionsSucceeded = (
  userId: string,
  meta: PendingMeta,
) => ({
  type: actionTypes.REVOKE_MEMBER_SESSIONS_SUCCEEDED,
  payload: { userId },
  meta,
});

export const fetchInvitations = () => ({
  type: actionTypes.FETCH_INVITATIONS_REQUESTED,
});

export const fetchInvitationsPending = () => ({
  type: actionTypes.FETCH_INVITATIONS_PENDING,
});

export const fetchInvitationsSucceeded = (items: PendingInvitation[]) => ({
  type: actionTypes.FETCH_INVITATIONS_SUCCEEDED,
  payload: { items },
});

export const fetchInvitationsFailed = (message: string) => ({
  type: actionTypes.FETCH_INVITATIONS_FAILED,
  payload: { message },
});

export const inviteMembers = (payload: {
  emails: string[];
  role: OrganizationRole;
}) => ({
  type: actionTypes.INVITE_MEMBERS_REQUESTED,
  payload,
  meta: { pendingKey: teamPendingKeys.invite },
});

export const inviteMembersSucceeded = (
  items: PendingInvitation[],
  meta: PendingMeta,
) => ({
  type: actionTypes.INVITE_MEMBERS_SUCCEEDED,
  payload: { items },
  meta,
});

export const resendInvitation = (payload: { id: string }) => ({
  type: actionTypes.RESEND_INVITATION_REQUESTED,
  payload,
  meta: { pendingKey: teamPendingKeys.invitation(payload.id) },
});

export const resendInvitationSucceeded = (
  invitation: PendingInvitation,
  meta: PendingMeta,
) => ({
  type: actionTypes.RESEND_INVITATION_SUCCEEDED,
  payload: invitation,
  meta,
});

export const revokeInvitation = (payload: { id: string }) => ({
  type: actionTypes.REVOKE_INVITATION_REQUESTED,
  payload,
  meta: { pendingKey: teamPendingKeys.invitation(payload.id) },
});

export const revokeInvitationSucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.REVOKE_INVITATION_SUCCEEDED,
  payload: { id },
  meta,
});

export const fetchAuditLog = (options: { append?: boolean } = {}) => ({
  type: actionTypes.FETCH_AUDIT_LOG_REQUESTED,
  payload: { append: Boolean(options.append) },
});

export const fetchAuditLogPending = (append: boolean) => ({
  type: actionTypes.FETCH_AUDIT_LOG_PENDING,
  payload: { append },
});

export const fetchAuditLogSucceeded = (payload: {
  items: AuditLogItem[];
  nextCursor: string | null;
  append: boolean;
}) => ({
  type: actionTypes.FETCH_AUDIT_LOG_SUCCEEDED,
  payload,
});

export const fetchAuditLogFailed = (message: string) => ({
  type: actionTypes.FETCH_AUDIT_LOG_FAILED,
  payload: { message },
});

export const setAuditFilters = (filters: Partial<AuditFilters>) => ({
  type: actionTypes.SET_AUDIT_FILTERS,
  payload: filters,
});

export const teamActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.TEAM_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

export const clearTeamIssues = () => ({
  type: actionTypes.CLEAR_TEAM_ISSUES,
});
