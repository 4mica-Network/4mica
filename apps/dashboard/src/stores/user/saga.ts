import { HttpError } from "@4mica/http";
import {
  getMe,
  updateAccount as updateAccountRequest,
  updateNotifications as updateNotificationsRequest,
  updateProfile as updateProfileRequest,
  upsertBusiness as upsertBusinessRequest,
} from "@api/user";
import i18n from "@i18n";
import { notifyError, notifySuccess } from "@utils/notification";
import { call, put, select, takeEvery } from "redux-saga/effects";
import {
  fetchUserFailed,
  fetchUserPending,
  fetchUserSucceeded,
  updateBusinessFailed,
  updateBusinessPending,
  updateBusinessSucceeded,
  updateUserFailed,
  updateUserPending,
  updateUserSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import { selectUser } from "./selector";
import type { Business, NotificationPlacement, User } from "./type";

interface ApiIssue {
  path: string;
  message: string;
}

const toIssueMap = (error: unknown): Record<string, string> => {
  if (!(error instanceof HttpError)) {
    return {};
  }

  const issues = (error.body as { issues?: ApiIssue[] } | null)?.issues;
  if (!Array.isArray(issues)) {
    return {};
  }

  return Object.fromEntries(issues.map((i) => [i.path, i.message]));
};

const toMessage = (error: unknown, fallback: string): string => {
  if (error instanceof HttpError) {
    const body = error.body as { message?: string } | null;
    return body?.message ?? fallback;
  }
  return fallback;
};

function* notifyPlacement(): Generator<unknown, NotificationPlacement> {
  const user = (yield select(selectUser)) as User | null;
  return user?.notificationPlacement ?? "bottomRight";
}

export function* fetchUser(): Generator {
  try {
    yield put(fetchUserPending());
    const response = yield call(getMe);
    yield put(
      fetchUserSucceeded(response as Awaited<ReturnType<typeof getMe>>),
    );
  } catch (error) {
    yield put(
      fetchUserFailed(
        toMessage(
          error,
          i18n.t("store.user.fetchFailed", {
            defaultValue: "We couldn't load your account.",
          }),
        ),
      ),
    );
  }
}

const updaters = {
  [actionTypes.UPDATE_PROFILE_REQUESTED]: updateProfileRequest,
  [actionTypes.UPDATE_ACCOUNT_REQUESTED]: updateAccountRequest,
  [actionTypes.UPDATE_NOTIFICATIONS_REQUESTED]: updateNotificationsRequest,
} as const;

export function* updateUser(action: {
  type: keyof typeof updaters;
  payload: Partial<User>;
}): Generator {
  const placement = (yield* notifyPlacement()) as NotificationPlacement;

  try {
    yield put(updateUserPending());

    const request = updaters[action.type];
    const response = yield call(() => request(action.payload));

    yield put(updateUserSucceeded(response as User));

    notifySuccess({
      title: i18n.t("store.user.updatedTitle", {
        defaultValue: "Changes saved",
      }),
      content: i18n.t("store.user.updatedBody", {
        defaultValue: "Your settings have been updated.",
      }),
      placement,
    });
  } catch (error) {
    const message = toMessage(
      error,
      i18n.t("store.user.updateFailedBody", {
        defaultValue: "Something went wrong while saving. Please try again.",
      }),
    );

    yield put(updateUserFailed(message, toIssueMap(error)));

    notifyError({
      title: i18n.t("store.user.updateFailedTitle", {
        defaultValue: "Update failed",
      }),
      content: message,
      placement,
    });
  }
}

export function* updateBusiness(action: {
  type: string;
  payload: Partial<Business>;
}): Generator {
  const placement = (yield* notifyPlacement()) as NotificationPlacement;

  try {
    yield put(updateBusinessPending());

    const response = yield call(() => upsertBusinessRequest(action.payload));

    yield put(updateBusinessSucceeded(response as Business));

    notifySuccess({
      title: i18n.t("store.business.updatedTitle", {
        defaultValue: "Business details saved",
      }),
      placement,
    });
  } catch (error) {
    const message = toMessage(
      error,
      i18n.t("store.business.updateFailedBody", {
        defaultValue: "Something went wrong while saving your business.",
      }),
    );

    yield put(updateBusinessFailed(message, toIssueMap(error)));

    notifyError({
      title: i18n.t("store.business.updateFailedTitle", {
        defaultValue: "Update failed",
      }),
      content: message,
      placement,
    });
  }
}

export default [
  takeEvery(actionTypes.FETCH_USER_REQUESTED, fetchUser),
  takeEvery(actionTypes.UPDATE_PROFILE_REQUESTED, updateUser),
  takeEvery(actionTypes.UPDATE_ACCOUNT_REQUESTED, updateUser),
  takeEvery(actionTypes.UPDATE_NOTIFICATIONS_REQUESTED, updateUser),
  takeEvery(actionTypes.UPDATE_BUSINESS_REQUESTED, updateBusiness),
];
