import { HttpError } from "@4mica/http";
import {
  checkUsernameAvailability,
  getMe,
  type UsernameAvailability,
  updateAccount as updateAccountRequest,
  updateNotifications as updateNotificationsRequest,
  updateProfile as updateProfileRequest,
  upsertBusiness as upsertBusinessRequest,
} from "@api/user";
import i18n from "@i18n";
import { notifyError } from "@utils/notification";
import { call, put, select, takeEvery, takeLatest } from "redux-saga/effects";
import {
  checkUsernameFailed,
  checkUsernameSucceeded,
  fetchUserFailed,
  fetchUserPending,
  fetchUserSucceeded,
  type UpdateMeta,
  updateBusinessFailed,
  updateBusinessSucceeded,
  updateUserFailed,
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

function* placement(): Generator<unknown, NotificationPlacement> {
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
  meta: UpdateMeta;
}): Generator {
  try {
    const request = updaters[action.type];
    const response = yield call(() => request(action.payload));
    yield put(updateUserSucceeded(response as User, action.meta));
  } catch (error) {
    const message = toMessage(
      error,
      i18n.t("store.user.updateFailedBody", {
        defaultValue: "Something went wrong while saving. Please try again.",
      }),
    );

    yield put(updateUserFailed(message, toIssueMap(error), action.meta));

    notifyError({
      title: i18n.t("store.user.updateFailedTitle", {
        defaultValue: "Update failed",
      }),
      content: message,
      placement: (yield* placement()) as NotificationPlacement,
    });
  }
}

export function* updateBusiness(action: {
  type: string;
  payload: Partial<Business>;
  meta: UpdateMeta;
}): Generator {
  try {
    const response = yield call(() => upsertBusinessRequest(action.payload));
    yield put(updateBusinessSucceeded(response as Business, action.meta));
  } catch (error) {
    const message = toMessage(
      error,
      i18n.t("store.business.updateFailedBody", {
        defaultValue: "Something went wrong while saving your business.",
      }),
    );

    yield put(updateBusinessFailed(message, toIssueMap(error), action.meta));

    notifyError({
      title: i18n.t("store.business.updateFailedTitle", {
        defaultValue: "Update failed",
      }),
      content: message,
      placement: (yield* placement()) as NotificationPlacement,
    });
  }
}

export function* checkUsername(action: {
  type: string;
  payload: string;
}): Generator {
  try {
    const response = yield call(() =>
      checkUsernameAvailability(action.payload),
    );
    const { username, available, reason } = response as UsernameAvailability;
    yield put(checkUsernameSucceeded(username, available, reason));
  } catch {
    // Deliberately quiet: this probe is advisory, the write is the authority,
    // and a toast on every failed keystroke check would be noise.
    yield put(checkUsernameFailed(action.payload));
  }
}

/**
 * Write the business, then flip the flag — and only in that order, so a failed
 * business write can never leave an account marked onboarded with no entity.
 */
export function* completeOnboarding(action: {
  type: string;
  payload: Partial<Business>;
  meta: UpdateMeta;
}): Generator {
  try {
    const business = yield call(() => upsertBusinessRequest(action.payload));
    yield put(updateBusinessSucceeded(business as Business, action.meta));
  } catch (error) {
    const message = toMessage(
      error,
      i18n.t("store.business.updateFailedBody", {
        defaultValue: "Something went wrong while saving your business.",
      }),
    );
    yield put(updateBusinessFailed(message, toIssueMap(error), action.meta));
    notifyError({
      title: i18n.t("store.business.updateFailedTitle", {
        defaultValue: "Update failed",
      }),
      content: message,
      placement: (yield* placement()) as NotificationPlacement,
    });
    return;
  }

  const meta = { section: "onboarding.complete" };

  try {
    const user = yield call(() =>
      updateAccountRequest({ completeOnboarding: true }),
    );
    yield put(updateUserSucceeded(user as User, meta));
  } catch (error) {
    const message = toMessage(
      error,
      i18n.t("store.user.onboardingFailedBody", {
        defaultValue: "We couldn't finish setting up your account.",
      }),
    );
    yield put(updateUserFailed(message, toIssueMap(error), meta));
    notifyError({
      title: i18n.t("store.user.onboardingFailedTitle", {
        defaultValue: "Setup incomplete",
      }),
      content: message,
      placement: (yield* placement()) as NotificationPlacement,
    });
  }
}

export default [
  takeEvery(actionTypes.FETCH_USER_REQUESTED, fetchUser),
  takeLatest(actionTypes.CHECK_USERNAME_REQUESTED, checkUsername),
  takeLatest(actionTypes.COMPLETE_ONBOARDING_REQUESTED, completeOnboarding),
  takeEvery(actionTypes.UPDATE_PROFILE_REQUESTED, updateUser),
  takeEvery(actionTypes.UPDATE_ACCOUNT_REQUESTED, updateUser),
  takeEvery(actionTypes.UPDATE_NOTIFICATIONS_REQUESTED, updateUser),
  takeEvery(actionTypes.UPDATE_BUSINESS_REQUESTED, updateBusiness),
];
