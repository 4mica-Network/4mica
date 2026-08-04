import type { RootState } from "..";
import type { Business, User, UserState } from "./type";

export const selectUserState = (state: RootState): UserState => state.user;

export const selectUser = (state: RootState): User | null => state.user.user;

export const selectBusiness = (state: RootState): Business | null =>
  state.user.business;

export const selectIsUserLoading = (state: RootState): boolean =>
  state.user.isLoading;

export const selectIsUpdating = (state: RootState): boolean =>
  state.user.isUpdateLoading;

export const selectIsBusinessUpdating = (state: RootState): boolean =>
  state.user.isBusinessUpdateLoading;

export const selectValidationIssues = (
  state: RootState,
): Record<string, string> => state.user.validationIssues;

export const selectIsAccountVerified = (state: RootState): boolean =>
  Boolean(state.user.user?.verified);

export const selectIsEmailVerified = (state: RootState): boolean =>
  Boolean(state.user.user?.emailVerified);

export const selectKybStatus = (state: RootState): string =>
  state.user.business?.kybStatus ?? "UNVERIFIED";
