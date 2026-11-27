import type { RootState } from "@stores/index";
import type {
  ApiKey,
  CliSession,
  DeveloperState,
  Webhook,
  WebhookEvent,
} from "./type";

export const selectDeveloper = (state: RootState): DeveloperState =>
  state.developer;

export const selectApiKeys = (state: RootState): ApiKey[] =>
  state.developer.apiKeys;

export const selectCliSessions = (state: RootState): CliSession[] =>
  state.developer.cliSessions;

export const selectCliSessionsState = (state: RootState) => ({
  isLoading: state.developer.cliSessionsLoading,
  hasLoaded: state.developer.cliSessionsLoaded,
  error: state.developer.cliSessionsError,
});

export const selectWebhooks = (state: RootState): Webhook[] =>
  state.developer.webhooks;

export const selectWebhookEvents = (state: RootState): WebhookEvent[] =>
  state.developer.events;

export const selectIsDeveloperLoading = (state: RootState): boolean =>
  state.developer.isLoading;

export const selectHasLoadedDeveloper = (state: RootState): boolean =>
  state.developer.hasLoaded;

export const selectIsDeveloperPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(state.developer.pending[key]);

export const selectDeveloperError = (state: RootState): string | null =>
  state.developer.error;

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
