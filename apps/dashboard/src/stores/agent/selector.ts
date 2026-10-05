import type { RootState } from "..";
import type { Agent, AgentFilters, AgentState } from "./type";

export const selectAgentState = (state: RootState): AgentState => state.agent;

export const selectAgents = (state: RootState): Agent[] => state.agent.items;

export const selectAgentTotal = (state: RootState): number => state.agent.total;

export const selectAgentPage = (state: RootState): number => state.agent.page;

export const selectAgentLimit = (state: RootState): number => state.agent.limit;

export const selectAgentFilters = (state: RootState): AgentFilters =>
  state.agent.filters;

export const selectSelectedAgentIds = (state: RootState): string[] =>
  state.agent.selectedIds;

export const selectIsAgentSelected =
  (id: string) =>
  (state: RootState): boolean =>
    state.agent.selectedIds.includes(id);

export const selectIsAgentsLoading = (state: RootState): boolean =>
  state.agent.isLoading;

export const selectHasLoadedAgents = (state: RootState): boolean =>
  state.agent.hasLoaded;

export const selectIsAgentPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(state.agent.pending[key]);

export const selectAgentError = (state: RootState): string | null =>
  state.agent.error;

export const selectAgentIssues = (state: RootState): Record<string, string> =>
  state.agent.validationIssues;

export const selectAreAllAgentsSelected = (state: RootState): boolean =>
  state.agent.items.length > 0 &&
  state.agent.items.every((item) => state.agent.selectedIds.includes(item.id));
