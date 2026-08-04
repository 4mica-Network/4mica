import type { MeResponse } from "@api/user";
import actionTypes from "./actionTypes";
import type { Business, User } from "./type";

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

export const updateProfile = (payload: Partial<User>) => ({
  type: actionTypes.UPDATE_PROFILE_REQUESTED,
  payload,
});

export const updateAccount = (payload: Partial<User>) => ({
  type: actionTypes.UPDATE_ACCOUNT_REQUESTED,
  payload,
});

export const updateNotifications = (payload: Partial<User>) => ({
  type: actionTypes.UPDATE_NOTIFICATIONS_REQUESTED,
  payload,
});

export const updateUserPending = () => ({
  type: actionTypes.UPDATE_USER_PENDING,
});

export const updateUserSucceeded = (data: User) => ({
  type: actionTypes.UPDATE_USER_SUCCEEDED,
  payload: data,
});

export const updateUserFailed = (
  message: string,
  issues: Record<string, string> = {},
) => ({
  type: actionTypes.UPDATE_USER_FAILED,
  payload: { message, issues },
});

export const updateBusiness = (payload: Partial<Business>) => ({
  type: actionTypes.UPDATE_BUSINESS_REQUESTED,
  payload,
});

export const updateBusinessPending = () => ({
  type: actionTypes.UPDATE_BUSINESS_PENDING,
});

export const updateBusinessSucceeded = (data: Business) => ({
  type: actionTypes.UPDATE_BUSINESS_SUCCEEDED,
  payload: data,
});

export const updateBusinessFailed = (
  message: string,
  issues: Record<string, string> = {},
) => ({
  type: actionTypes.UPDATE_BUSINESS_FAILED,
  payload: { message, issues },
});

export const clearValidationIssues = () => ({
  type: actionTypes.CLEAR_VALIDATION_ISSUES,
});
