import * as api from "@api/organization";
import i18n from "@i18n";
import { fetchOrganizations } from "@stores/organization/actions";
import organizationActionTypes from "@stores/organization/actionTypes";
import { failureMessage } from "@stores/organization/saga";
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
  teamActionFailed,
  updateMemberRoleSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import { selectAuditLog, selectTeamState } from "./selector";
import type {
  AuditLogItem,
  AuditLogState,
  Member,
  PendingInvitation,
  TeamState,
} from "./type";

export const AUDIT_PAGE_SIZE = 50;

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  const message = failureMessage(error, fallback);
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
  payload: { userId: string; role: OrganizationRole };
  meta: PendingMeta;
}): Generator {
  try {
    const member = (yield call(() =>
      api.updateMemberRole(action.payload.userId, action.payload.role),
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
        ...definedParams({
          action: audit.action,
          cursor: append ? audit.nextCursor : null,
        }),
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
