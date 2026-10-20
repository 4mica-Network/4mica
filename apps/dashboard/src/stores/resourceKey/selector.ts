import type { ApiKey } from "@stores/developer/type";
import type { RootState } from "@stores/index";
import type { RevealedResourceKey } from "./type";

export const selectResourceKeys = (state: RootState): ApiKey[] =>
  state.resourceKey.items;

export const selectRevealedResourceKey = (
  state: RootState,
): RevealedResourceKey | null => state.resourceKey.revealed;

export const selectIsResourceKeysLoading = (state: RootState): boolean =>
  state.resourceKey.isLoading;

export const selectHasLoadedResourceKeys = (state: RootState): boolean =>
  state.resourceKey.hasLoaded;

export const selectIsResourceKeyPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(state.resourceKey.pending[key]);

export const selectResourceKeyError = (state: RootState): string | null =>
  state.resourceKey.error;

export const selectResourceKeyIssues = (
  state: RootState,
): Record<string, string> => state.resourceKey.validationIssues;
