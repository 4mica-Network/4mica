import type { RootState } from "..";
import type { Business, User, UsernameCheck, UserState } from "./type";

export const selectUserState = (state: RootState): UserState => state.user;

export const selectUser = (state: RootState): User | null => state.user.user;

export const selectBusiness = (state: RootState): Business | null =>
  state.user.business;

export const selectIsUserLoading = (state: RootState): boolean =>
  state.user.isLoading;

export const selectSavingSections = (
  state: RootState,
): Record<string, boolean> => state.user.savingSections;

export const selectIsSectionSaving =
  (section: string) =>
  (state: RootState): boolean =>
    Boolean(state.user.savingSections[section]);

export const selectIsAnySaving = (state: RootState): boolean =>
  Object.keys(state.user.savingSections).length > 0;

export const selectValidationIssues = (
  state: RootState,
): Record<string, string> => state.user.validationIssues;

export const selectIsAccountVerified = (state: RootState): boolean =>
  Boolean(state.user.user?.verified);

export const selectIsEmailVerified = (state: RootState): boolean =>
  Boolean(state.user.user?.emailVerified);

export const selectKybStatus = (state: RootState): string =>
  state.user.business?.kybStatus ?? "UNVERIFIED";

export const selectUsernameCheck = (state: RootState): UsernameCheck =>
  state.user.usernameCheck;

export const selectHasCompletedOnboarding = (state: RootState): boolean =>
  Boolean(state.user.user?.completeOnboarding);

/**
 * Null-safe on purpose. Before GET /me resolves `user` is null, so this is
 * false and the blocking modal never flashes on top of the app; if the fetch
 * fails it stays null and stays false, and `state.user.error` is what surfaces.
 *
 * Do NOT rewrite this as `!selectIsUserLoading(state) && ...` — `isLoading`
 * starts false and only flips true once FETCH_USER_PENDING lands, so there is a
 * window where that reads "loaded" for a user who has not been fetched at all.
 */
export const selectNeedsOnboarding = (state: RootState): boolean =>
  state.user.user !== null && !state.user.user.completeOnboarding;
