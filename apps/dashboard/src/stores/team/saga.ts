import * as api from "@api/organization";
import i18n from "@i18n";
import { handledAsApproval } from "@stores/approvalRequired";
import { fetchOrganizations } from "@stores/organization/actions";
import organizationActionTypes from "@stores/organization/actionTypes";
import { errorCode, failureMessage } from "@stores/organization/saga";
import type { OrganizationRole } from "@stores/organization/type";
import { selectUser } from "@stores/user/selector";
import type { User } from "@stores/user/type";
import { definedParams, type PendingMeta } from "@stores/utils";
import { toIssueMap, toMessage } from "@utils/http-errors";
import { call, put, select, takeEvery, takeLatest } from "redux-saga/effects";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  fetchAuditLogFailed,
  fetchAuditLogPending,
  fetchAuditLogSucceeded,
  fetchInvitationsFailed,
  fetchInvitationsPending,
  fetchInvitationsSucceeded,
  fetchMembers as fetchMembersAction,
  fetchMembersFailed,
  fetchMembersPending,
  fetchMembersSucceeded,
  inviteMembersSucceeded,
  removeMemberSucceeded,
  resendInvitationSucceeded,
  revokeInvitationSucceeded,
  revokeMemberSessionsSucceeded,
  suspendMemberSucceeded,
  teamActionFailed,
  updateMemberRoleSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import { selectAuditLog, selectTeamState } from "./selector";
import type {
  AuditFilters,
  AuditLogItem,
  AuditLogState,
  Member,
  PendingInvitation,
  RoleAssignment,
  TeamState,
} from "./type";

export const AUDIT_PAGE_SIZE = 50;

export const auditParams = (filters: AuditFilters) =>
  definedParams({
    ...filters,
    from: filters.from ? `${filters.from}T00:00:00.000Z` : "",
    to: filters.to ? `${filters.to}T23:59:59.999Z` : "",
    q: filters.q.trim(),
    actionPrefix: filters.actionPrefix.trim(),
    targetId: filters.targetId.trim(),
  });

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  if (yield* handledAsApproval(error, teamActionFailed("", {}, meta))) {
    return;
  }
  const message =
    errorCode(error) === "identity_not_managed"
      ? t(
          "store.team.identityNotManaged",
          "Only members whose email is on one of your verified domains can be signed out everywhere. Ask this member to sign out themselves, or remove them.",
        )
      : failureMessage(error, fallback);
  const issues = toIssueMap(error);
  yield put(teamActionFailed(message, issues, meta));
  notifyError({
    title: t("store.organization.failedTitle", "Something went wrong"),
    content: message,
  });
}

export function* fetchMembers(): Generator {
  try {
    yield put(fetchMembersPending());
    const { items } = (yield call(api.getMembers)) as { items: Member[] };
    yield put(fetchMembersSucceeded(items));
  } catch (error) {
    yield put(
      fetchMembersFailed(
        toMessage(
          error,
          t("store.team.membersFailed", "Couldn't load the members."),
        ),
      ),
    );
  }
}

export function* fetchInvitations(): Generator {
  try {
    yield put(fetchInvitationsPending());
    const { items } = (yield call(api.getInvitations)) as {
      items: PendingInvitation[];
    };
    yield put(fetchInvitationsSucceeded(items));
  } catch (error) {
    yield put(
      fetchInvitationsFailed(
        toMessage(
          error,
          t("store.team.invitationsFailed", "Couldn't load the invitations."),
        ),
      ),
    );
  }
}

export function* updateMemberRole(action: {
  type: string;
  payload: { userId: string } & RoleAssignment;
  meta: PendingMeta;
}): Generator {
  try {
    const { userId, ...assignment } = action.payload;
    const member = (yield call(() =>
      api.updateMemberRole(userId, assignment as RoleAssignment),
    )) as Member;
    yield put(updateMemberRoleSucceeded(member, action.meta));
    const user = (yield select(selectUser)) as User | null;
    if (user && user.id === member.userId) {
      yield put(fetchOrganizations());
    }
  } catch (error) {
    yield* fail(
      error,
      t("store.team.roleFailed", "Couldn't change the role."),
      action.meta,
    );
  }
}

export function* suspendMember(action: {
  type: string;
  payload: { userId: string; suspended: boolean };
  meta: PendingMeta;
}): Generator {
  const { userId, suspended } = action.payload;
  try {
    const member = (yield call(() =>
      api.suspendMember(userId, suspended),
    )) as Member;
    yield put(suspendMemberSucceeded(member, action.meta));
    notifySuccess({
      title: suspended
        ? t("store.team.suspendedTitle", "Member suspended")
        : t("store.team.reactivatedTitle", "Member reactivated"),
      content: suspended
        ? t(
            "store.team.suspendedBody",
            "They can no longer use this organization, and their CLI sessions here were revoked.",
          )
        : t("store.team.reactivatedBody", "Their access is restored."),
    });
  } catch (error) {
    yield* fail(
      error,
      suspended
        ? t("store.team.suspendFailed", "Couldn't suspend the member.")
        : t("store.team.reactivateFailed", "Couldn't reactivate the member."),
      action.meta,
    );
  }
}

export function* revokeMemberSessions(action: {
  type: string;
  payload: { userId: string };
  meta: PendingMeta;
}): Generator {
  try {
    const { revoked } = (yield call(() =>
      api.revokeMemberSessions(action.payload.userId),
    )) as { revoked: number };
    yield put(
      revokeMemberSessionsSucceeded(action.payload.userId, action.meta),
    );
    notifySuccess({
      title: t("store.team.sessionsRevokedTitle", "Signed out everywhere"),
      content: i18n.t("store.team.sessionsRevokedBody", {
        count: revoked,
        defaultValue: "{{count}} sessions were ended.",
      }),
    });
  } catch (error) {
    yield* fail(
      error,
      t("store.team.sessionsRevokeFailed", "Couldn't sign the member out."),
      action.meta,
    );
  }
}

export function* removeMember(action: {
  type: string;
  payload: { userId: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.removeMember(action.payload.userId));
    yield put(removeMemberSucceeded(action.payload.userId, action.meta));
    notifySuccess({
      title: t("store.team.removedTitle", "Member removed"),
      content: t(
        "store.team.removedBody",
        "They no longer have access to this organization.",
      ),
    });
  } catch (error) {
    yield* fail(
      error,
      t("store.team.removeFailed", "Couldn't remove the member."),
      action.meta,
    );
  }
}

export function* inviteMembers(action: {
  type: string;
  payload: { emails: string[]; role: OrganizationRole };
  meta: PendingMeta;
}): Generator {
  try {
    const { items } = (yield call(() =>
      api.createInvitations(action.payload),
    )) as { items: PendingInvitation[] };
    yield put(inviteMembersSucceeded(items, action.meta));
    notifySuccess({
      title: t("store.team.invitedTitle", "Invitations sent"),
      content: t(
        "store.team.invitedBody",
        "We emailed each person a link to join.",
      ),
    });
  } catch (error) {
    yield* fail(
      error,
      t("store.team.inviteFailed", "Couldn't send the invitations."),
      action.meta,
    );
  }
}

export function* resendInvitation(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    const invitation = (yield call(() =>
      api.resendInvitation(action.payload.id),
    )) as PendingInvitation;
    yield put(resendInvitationSucceeded(invitation, action.meta));
    notifySuccess({
      title: t("store.team.resentTitle", "Invitation sent again"),
      content: invitation.email,
    });
  } catch (error) {
    yield* fail(
      error,
      t("store.team.resendFailed", "Couldn't resend the invitation."),
      action.meta,
    );
  }
}

export function* revokeInvitation(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.revokeInvitation(action.payload.id));
    yield put(revokeInvitationSucceeded(action.payload.id, action.meta));
  } catch (error) {
    yield* fail(
      error,
      t("store.team.revokeFailed", "Couldn't revoke the invitation."),
      action.meta,
    );
  }
}

export function* fetchAuditLog(action: {
  type: string;
  payload: { append: boolean };
}): Generator {
  const { append } = action.payload;
  try {
    yield put(fetchAuditLogPending(append));
    const audit = (yield select(selectAuditLog)) as AuditLogState;
    const result = (yield call(() =>
      api.getAuditLogs({
        limit: AUDIT_PAGE_SIZE,
        ...auditParams(audit.filters),
        ...definedParams({ cursor: append ? audit.nextCursor : null }),
      }),
    )) as { items: AuditLogItem[]; nextCursor: string | null };
    yield put(fetchAuditLogSucceeded({ ...result, append }));
  } catch (error) {
    yield put(
      fetchAuditLogFailed(
        toMessage(
          error,
          t("store.team.auditFailed", "Couldn't load the audit log."),
        ),
      ),
    );
  }
}

export function* refreshMembersAfterTransfer(): Generator {
  const { membersStatus } = (yield select(selectTeamState)) as TeamState;
  if (membersStatus === "loaded") {
    yield put(fetchMembersAction());
  }
}

export default [
  takeLatest(actionTypes.FETCH_MEMBERS_REQUESTED, fetchMembers),
  takeLatest(actionTypes.FETCH_INVITATIONS_REQUESTED, fetchInvitations),
  takeEvery(actionTypes.UPDATE_MEMBER_ROLE_REQUESTED, updateMemberRole),
  takeEvery(actionTypes.SUSPEND_MEMBER_REQUESTED, suspendMember),
  takeEvery(actionTypes.REVOKE_MEMBER_SESSIONS_REQUESTED, revokeMemberSessions),
  takeEvery(actionTypes.REMOVE_MEMBER_REQUESTED, removeMember),
  takeEvery(actionTypes.INVITE_MEMBERS_REQUESTED, inviteMembers),
  takeEvery(actionTypes.RESEND_INVITATION_REQUESTED, resendInvitation),
  takeEvery(actionTypes.REVOKE_INVITATION_REQUESTED, revokeInvitation),
  takeLatest(actionTypes.FETCH_AUDIT_LOG_REQUESTED, fetchAuditLog),
  takeEvery(
    organizationActionTypes.TRANSFER_ORGANIZATION_SUCCEEDED,
    refreshMembersAfterTransfer,
  ),
];
