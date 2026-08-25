import type { MeResponse } from "@api/user";
import actionTypes from "./actionTypes";
import type { Business, User } from "./type";

export interface UpdateMeta {
  section: string;
}

export const fetchUser = () => ({
  type: actionTypes.FETCH_USER_REQUESTED,
});

export const fetchUserPending = () => ({
  type: actionTypes.FETCH_USER_PENDING,
});

export const fetchUserSucceeded = (data: MeResponse) => ({
  type: actionTypes.FETCH_USER_SUCCEEDED,
  payload: data,
});

export const fetchUserFailed = (message: string) => ({
  type: actionTypes.FETCH_USER_FAILED,
  payload: { message },
});

export const updateProfile = (payload: Partial<User>, section = "profile") => ({
  type: actionTypes.UPDATE_PROFILE_REQUESTED,
  payload,
  meta: { section },
});

export const updateAccount = (payload: Partial<User>, section = "account") => ({
  type: actionTypes.UPDATE_ACCOUNT_REQUESTED,
  payload,
  meta: { section },
});

export const updateNotifications = (
  payload: Partial<User>,
  section = "notifications",
) => ({
  type: actionTypes.UPDATE_NOTIFICATIONS_REQUESTED,
  payload,
  meta: { section },
});

export const updateUserSucceeded = (data: User, meta: UpdateMeta) => ({
  type: actionTypes.UPDATE_USER_SUCCEEDED,
  payload: data,
  meta,
});

export const updateUserFailed = (
  message: string,
  issues: Record<string, string>,
  meta: UpdateMeta,
) => ({
  type: actionTypes.UPDATE_USER_FAILED,
  payload: { message, issues },
  meta,
});

export const updateBusiness = (
  payload: Partial<Business>,
  section = "business",
) => ({
  type: actionTypes.UPDATE_BUSINESS_REQUESTED,
  payload,
  meta: { section },
});

export const updateBusinessSucceeded = (data: Business, meta: UpdateMeta) => ({
  type: actionTypes.UPDATE_BUSINESS_SUCCEEDED,
  payload: data,
  meta,
});

export const updateBusinessFailed = (
  message: string,
  issues: Record<string, string>,
  meta: UpdateMeta,
) => ({
  type: actionTypes.UPDATE_BUSINESS_FAILED,
  payload: { message, issues },
  meta,
});

export const checkUsername = (username: string) => ({
  type: actionTypes.CHECK_USERNAME_REQUESTED,
  payload: username,
});

export const checkUsernameSucceeded = (
  username: string,
  available: boolean,
  reason: "taken" | "reserved" | null,
) => ({
  type: actionTypes.CHECK_USERNAME_SUCCEEDED,
  payload: { username, available, reason },
});

export const checkUsernameFailed = (username: string) => ({
  type: actionTypes.CHECK_USERNAME_FAILED,
  payload: { username },
});

export const resetUsernameCheck = () => ({
  type: actionTypes.RESET_USERNAME_CHECK,
});

/**
 * The last leg of onboarding: write the business, and only if that lands, flip
 * `completeOnboarding`. The ordering matters, so it belongs in a saga rather
 * than two dispatches racing from a component.
 */
export const completeOnboarding = (
  payload: Partial<Business>,
  section = "onboarding.business",
) => ({
  type: actionTypes.COMPLETE_ONBOARDING_REQUESTED,
  payload,
  meta: { section },
});

export const clearValidationIssues = () => ({
  type: actionTypes.CLEAR_VALIDATION_ISSUES,
});
