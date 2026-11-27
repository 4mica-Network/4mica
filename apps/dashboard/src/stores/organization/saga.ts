import { HttpError } from "@4mica/http";
import * as api from "@api/organization";
import i18n from "@i18n";
import { resetSession } from "@stores/session";
import { fetchUser } from "@stores/user/actions";
import type { PendingMeta } from "@stores/utils";
import { toIssueMap, toMessage } from "@utils/http-errors";
import { call, put, select, takeEvery, takeLatest } from "redux-saga/effects";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  acceptInvitationSucceeded,
  activeOrganizationSet,
  createOrganizationSucceeded,
  declineInvitationSucceeded,
  deleteOrganizationSucceeded,
  fetchInvitationFailed,
  fetchInvitationSucceeded,
  fetchOrganizations as fetchOrganizationsAction,
  fetchOrganizationsFailed,
  fetchOrganizationsPending,
  fetchOrganizationsSucceeded,
  invitationActionFailed,
  leaveOrganizationSucceeded,
  organizationActionFailed,
  transferOrganizationSucceeded,
  updateOrganizationSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import {
  readActiveOrganizationId,
  resolveActiveId,
  writeActiveOrganizationId,
} from "./persist";
import { selectOrganizationState } from "./selector";
import type {
  InvitationPreview,
  OrganizationList,
  OrganizationState,
  OrganizationSummary,
} from "./type";

export const KEPT_ON_SWITCH = ["user", "organization"] as const;

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

export const errorCode = (error: unknown): string | null => {
  if (!(error instanceof HttpError)) {
    return null;
  }
  const code = (error.body as { error?: unknown } | null)?.error;
  return typeof code === "string" ? code : null;
};

const CODE_MESSAGES: Record<string, [string, string]> = {
  last_owner: [
    "store.organization.lastOwner",
    "An organization needs at least one owner. Make someone else an owner first.",
  ],
  personal_organization: [
    "store.organization.personal",
    "Personal workspaces can't do that.",
  ],
  forbidden: [
    "store.organization.forbidden",
    "Your role in this organization doesn't allow that.",
  ],
};

export const failureMessage = (error: unknown, fallback: string): string => {
  const code = errorCode(error);
  const known = code ? CODE_MESSAGES[code] : undefined;
  return known ? t(...known) : toMessage(error, fallback);
};

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  const code = errorCode(error);
  const issues = toIssueMap(error);
  if (code === "handle_taken") {
    issues.handle = t(
      "store.organization.handleTaken",
      "That handle is already taken.",
    );
  }
  const message = failureMessage(error, fallback);

  yield put(organizationActionFailed(message, issues, meta));

  if (Object.keys(issues).length === 0) {
    notifyError({
      title: t("store.organization.failedTitle", "Something went wrong"),
      content: message,
    });
  }
}

function* enterOrganization(id: string): Generator {
  yield put(activeOrganizationSet(id));
  yield call(writeActiveOrganizationId, id);
  yield put(resetSession(KEPT_ON_SWITCH));
  yield put(fetchUser());
}

function* enterPersonalOrganization(): Generator {
  const { items, defaultId } = (yield select(
    selectOrganizationState,
  )) as OrganizationState;
  const target = items.find((item) => item.personal)?.id ?? defaultId;
  if (target) {
    yield* enterOrganization(target);
  } else {
    yield put(fetchOrganizationsAction());
  }
}

export function* fetchOrganizations(): Generator {
  const before = (yield select(selectOrganizationState)) as OrganizationState;
  try {
    yield put(fetchOrganizationsPending());
    const result = (yield call(api.getOrganizations)) as OrganizationList;
    const activeId = resolveActiveId(
      [before.activeId, readActiveOrganizationId()],
      result.items,
      result.defaultId,
    );
    yield call(writeActiveOrganizationId, activeId);
    yield put(fetchOrganizationsSucceeded({ ...result, activeId }));

    if (before.activeId && activeId !== before.activeId) {
      yield put(resetSession(KEPT_ON_SWITCH));
      yield put(fetchUser());
    } else if (!before.activeId && activeId && activeId !== result.defaultId) {
      yield put(fetchUser());
    }
  } catch (error) {
    yield put(
      fetchOrganizationsFailed(
        toMessage(
          error,
          t(
            "store.organization.fetchFailed",
            "Couldn't load your organizations.",
          ),
        ),
      ),
    );
  }
}

export function* switchOrganization(action: {
  type: string;
  payload: { id: string };
}): Generator {
  const { items, activeId } = (yield select(
    selectOrganizationState,
  )) as OrganizationState;
  const { id } = action.payload;
  if (id === activeId || !items.some((item) => item.id === id)) {
    return;
  }
  yield* enterOrganization(id);
}

export function* createOrganization(action: {
  type: string;
  payload: { name: string; handle: string };
  meta: PendingMeta;
}): Generator {
  try {
    const created = (yield call(() =>
      api.createOrganization(action.payload),
    )) as OrganizationSummary;
    yield put(createOrganizationSucceeded(created, action.meta));
    notifySuccess({
      title: t("store.organization.createdTitle", "Organization created"),
      content: t(
        "store.organization.createdBody",
        "You're now working in your new organization.",
      ),
    });
    yield* enterOrganization(created.id);
  } catch (error) {
    yield* fail(
      error,
      t("store.organization.createFailed", "Couldn't create the organization."),
      action.meta,
    );
  }
}

export function* updateOrganization(action: {
  type: string;
  payload: { name?: string; handle?: string };
  meta: PendingMeta;
}): Generator {
  try {
    const updated = (yield call(() =>
      api.updateOrganization(action.payload),
    )) as OrganizationSummary;
    yield put(updateOrganizationSucceeded(updated, action.meta));
    notifySuccess({
      title: t("store.organization.updatedTitle", "Organization updated"),
      content: t(
        "store.organization.updatedBody",
        "Your changes have been saved.",
      ),
    });
  } catch (error) {
    yield* fail(
      error,
      t("store.organization.updateFailed", "Couldn't save the organization."),
      action.meta,
    );
  }
}

function* removeActive(
  request: () => Promise<void>,
  succeeded: (id: string, meta: PendingMeta) => { type: string },
  meta: PendingMeta,
  copy: { title: [string, string]; failed: [string, string] },
): Generator {
  const { activeId } = (yield select(
    selectOrganizationState,
  )) as OrganizationState;
  if (!activeId) {
    return;
  }
  try {
    yield call(request);
    yield put(succeeded(activeId, meta));
    notifySuccess({
      title: t(...copy.title),
      content: t(
        "store.organization.backToPersonal",
        "You're back in your personal workspace.",
      ),
    });
    yield* enterPersonalOrganization();
  } catch (error) {
    yield* fail(error, t(...copy.failed), meta);
  }
}

export function* leaveOrganization(action: {
  type: string;
  meta: PendingMeta;
}): Generator {
  yield* removeActive(
    api.leaveOrganization,
    leaveOrganizationSucceeded,
    action.meta,
    {
      title: ["store.organization.leftTitle", "You left the organization"],
      failed: [
        "store.organization.leaveFailed",
        "Couldn't leave the organization.",
      ],
    },
  );
}

export function* deleteOrganization(action: {
  type: string;
  meta: PendingMeta;
}): Generator {
  yield* removeActive(
    api.deleteOrganization,
    deleteOrganizationSucceeded,
    action.meta,
    {
      title: ["store.organization.deletedTitle", "Organization deleted"],
      failed: [
        "store.organization.deleteFailed",
        "Couldn't delete the organization.",
      ],
    },
  );
}

export function* transferOrganization(action: {
  type: string;
  payload: { userId: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.transferOrganization(action.payload.userId));
    yield put(
      transferOrganizationSucceeded(action.payload.userId, action.meta),
    );
    notifySuccess({
      title: t("store.organization.transferredTitle", "Ownership transferred"),
      content: t(
        "store.organization.transferredBody",
        "You're now an admin of this organization.",
      ),
    });
    yield put(fetchOrganizationsAction());
  } catch (error) {
    yield* fail(
      error,
      t("store.organization.transferFailed", "Couldn't transfer ownership."),
      action.meta,
    );
  }
}

const invitationCode = (error: unknown): string => {
  const code = errorCode(error);
  if (code) {
    return code;
  }
  if (error instanceof HttpError) {
    if (error.status === 410) {
      return "invitation_unavailable";
    }
    if (error.status === 404) {
      return "not_found";
    }
  }
  return "error";
};

const invitationFailure = (error: unknown) =>
  toMessage(
    error,
    t("store.organization.invitationFailed", "Couldn't open this invitation."),
  );

export function* fetchInvitation(action: {
  type: string;
  payload: { token: string };
}): Generator {
  const { token } = action.payload;
  try {
    const preview = (yield call(() =>
      api.getInvitation(token),
    )) as InvitationPreview;
    yield put(fetchInvitationSucceeded(token, preview));
  } catch (error) {
    yield put(
      fetchInvitationFailed(
        token,
        invitationCode(error),
        invitationFailure(error),
      ),
    );
  }
}

export function* acceptInvitation(action: {
  type: string;
  payload: { token: string };
  meta: PendingMeta;
}): Generator {
  try {
    const { organization } = (yield call(() =>
      api.acceptInvitation(action.payload.token),
    )) as { organization: OrganizationSummary };
    yield put(acceptInvitationSucceeded(organization, action.meta));
    notifySuccess({
      title: t("store.organization.joinedTitle", "Welcome aboard"),
      content: t(
        "store.organization.joinedBody",
        "You've joined the organization.",
      ),
    });
    yield* enterOrganization(organization.id);
  } catch (error) {
    yield put(
      invitationActionFailed(
        invitationCode(error),
        invitationFailure(error),
        action.meta,
      ),
    );
  }
}

export function* declineInvitation(action: {
  type: string;
  payload: { token: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.declineInvitation(action.payload.token));
    yield put(declineInvitationSucceeded(action.meta));
  } catch (error) {
    yield put(
      invitationActionFailed(
        invitationCode(error),
        invitationFailure(error),
        action.meta,
      ),
    );
  }
}

export default [
  takeLatest(actionTypes.FETCH_ORGANIZATIONS_REQUESTED, fetchOrganizations),
  takeLatest(actionTypes.SWITCH_ORGANIZATION_REQUESTED, switchOrganization),
  takeEvery(actionTypes.CREATE_ORGANIZATION_REQUESTED, createOrganization),
  takeEvery(actionTypes.UPDATE_ORGANIZATION_REQUESTED, updateOrganization),
  takeLatest(actionTypes.LEAVE_ORGANIZATION_REQUESTED, leaveOrganization),
  takeLatest(actionTypes.DELETE_ORGANIZATION_REQUESTED, deleteOrganization),
  takeLatest(actionTypes.TRANSFER_ORGANIZATION_REQUESTED, transferOrganization),
  takeLatest(actionTypes.FETCH_INVITATION_REQUESTED, fetchInvitation),
  takeLatest(actionTypes.ACCEPT_INVITATION_REQUESTED, acceptInvitation),
  takeLatest(actionTypes.DECLINE_INVITATION_REQUESTED, declineInvitation),
];
