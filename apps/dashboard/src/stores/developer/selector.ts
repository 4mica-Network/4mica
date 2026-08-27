import type { RootState } from "..";
import type {
  ApiKey,
  DeveloperState,
  RevealedSecret,
  Webhook,
  WebhookEvent,
} from "./type";

export const selectDeveloper = (state: RootState): DeveloperState =>
  state.developer;

export const selectApiKeys = (state: RootState): ApiKey[] =>
  state.developer.apiKeys;

export const selectWebhooks = (state: RootState): Webhook[] =>
  state.developer.webhooks;

export const selectWebhookEvents = (state: RootState): WebhookEvent[] =>
  state.developer.events;

export const selectRevealedSecret = (state: RootState): RevealedSecret | null =>
  state.developer.revealed;

export const selectIsDeveloperLoading = (state: RootState): boolean =>
  state.developer.isLoading;

export const selectHasLoadedDeveloper = (state: RootState): boolean =>
  state.developer.hasLoaded;

export const selectIsPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(state.developer.pending[key]);

export const selectDeveloperIssues = (
  state: RootState,
): Record<string, string> => state.developer.validationIssues;

/** Event slugs bucketed by their group, for a grouped picker. */
export const selectEventsByGroup = (
  state: RootState,
): Array<[string, WebhookEvent[]]> => {
  const groups = new Map<string, WebhookEvent[]>();
  for (const event of state.developer.events) {
    groups.set(event.group, [...(groups.get(event.group) ?? []), event]);
  }
  return [...groups.entries()];
};
