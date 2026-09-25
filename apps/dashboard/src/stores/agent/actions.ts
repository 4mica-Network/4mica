import type { AgentInput } from "@api/agent";
import actionTypes from "./actionTypes";
import type { Agent, AgentFilters } from "./type";

export interface PendingMeta {
  pendingKey: string;
}

const rowKey = (id: string) => `agent:${id}`;

export const fetchAgents = () => ({
  type: actionTypes.FETCH_AGENTS_REQUESTED,
});

export const fetchAgentsPending = () => ({
  type: actionTypes.FETCH_AGENTS_PENDING,
});

export const fetchAgentsSucceeded = (payload: {
  items: Agent[];
  total: number;
  page: number;
  limit: number;
}) => ({
  type: actionTypes.FETCH_AGENTS_SUCCEEDED,
  payload,
});

export const fetchAgentsFailed = (message: string) => ({
  type: actionTypes.FETCH_AGENTS_FAILED,
  payload: { message },
});

export const createAgent = (payload: AgentInput) => ({
  type: actionTypes.CREATE_AGENT_REQUESTED,
  payload,
  meta: { pendingKey: "createAgent" },
});

export const createAgentSucceeded = (agent: Agent, meta: PendingMeta) => ({
  type: actionTypes.CREATE_AGENT_SUCCEEDED,
  payload: agent,
  meta,
});

export const updateAgent = (payload: {
  id: string;
  data: Partial<AgentInput>;
}) => ({
  type: actionTypes.UPDATE_AGENT_REQUESTED,
  payload,
  meta: { pendingKey: rowKey(payload.id) },
});

export const updateAgentSucceeded = (agent: Agent, meta: PendingMeta) => ({
  type: actionTypes.UPDATE_AGENT_SUCCEEDED,
  payload: agent,
  meta,
});

export const publishAgent = (payload: { id: string; publish: boolean }) => ({
  type: actionTypes.PUBLISH_AGENT_REQUESTED,
  payload,
  meta: { pendingKey: rowKey(payload.id) },
});

export const publishAgentSucceeded = (agent: Agent, meta: PendingMeta) => ({
  type: actionTypes.PUBLISH_AGENT_SUCCEEDED,
  payload: agent,
  meta,
});

export const deleteAgent = (payload: { id: string }) => ({
  type: actionTypes.DELETE_AGENT_REQUESTED,
  payload,
  meta: { pendingKey: rowKey(payload.id) },
});

export const deleteAgentSucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.DELETE_AGENT_SUCCEEDED,
  payload: { id },
  meta,
});

export const batchDeleteAgents = (payload: { ids: string[] }) => ({
  type: actionTypes.BATCH_DELETE_AGENTS_REQUESTED,
  payload,
  meta: { pendingKey: "batchDeleteAgents" },
});

export const batchDeleteAgentsSucceeded = (
  payload: { deleted: string[]; notFound: string[] },
  meta: PendingMeta,
) => ({
  type: actionTypes.BATCH_DELETE_AGENTS_SUCCEEDED,
  payload,
  meta,
});

export const setAgentFilters = (payload: Partial<AgentFilters>) => ({
  type: actionTypes.SET_AGENT_FILTERS,
  payload,
});

export const setAgentPage = (page: number) => ({
  type: actionTypes.SET_AGENT_PAGE,
  payload: { page },
});

export const toggleAgentSelected = (id: string) => ({
  type: actionTypes.TOGGLE_AGENT_SELECTED,
  payload: { id },
});

export const setAgentSelection = (ids: string[]) => ({
  type: actionTypes.SET_AGENT_SELECTION,
  payload: { ids },
});

export const clearAgentSelection = () => ({
  type: actionTypes.CLEAR_AGENT_SELECTION,
});

export const agentActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.AGENT_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

export const clearAgentIssues = () => ({
  type: actionTypes.CLEAR_AGENT_ISSUES,
});
