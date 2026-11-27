import type { ApiKey } from "@stores/developer/type";
import type { RootState } from "@stores/index";
import type { LoadStatus } from "@stores/organization/type";
import { INITIAL_STATE } from "./reducer";
import type { ServiceAccount, ServiceAccountState } from "./type";

const EMPTY: ApiKey[] = [];

const selectState = (state: RootState): ServiceAccountState =>
  state.serviceAccount ?? INITIAL_STATE;

export const selectServiceAccounts = (state: RootState): ServiceAccount[] =>
  selectState(state).items;

export const selectServiceAccountsStatus = (state: RootState): LoadStatus =>
  selectState(state).status;

export const selectServiceAccountsError = (state: RootState): string | null =>
  selectState(state).error;

export const selectServiceAccountKeys =
  (id: string) =>
  (state: RootState): ApiKey[] =>
    selectState(state).keys[id] ?? EMPTY;

export const selectServiceAccountKeysStatus =
  (id: string) =>
  (state: RootState): LoadStatus =>
    selectState(state).keysStatus[id] ?? "idle";

export const selectIsServiceAccountPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(selectState(state).pending[key]);

export const selectServiceAccountIssues = (
  state: RootState,
): Record<string, string> => selectState(state).issues;

export const selectServiceAccountActionError = (
  state: RootState,
): string | null => selectState(state).actionError;
