import { HttpMethod } from "@4mica/http";
import type {
  Agent,
  AgentListResponse,
  AgentStatus,
  BatchDeleteResult,
  PaymentNetwork,
  PublicVisibility,
} from "@stores/agent/type";
import { httpClient } from "./client";

export interface ListAgentsParams
  extends Record<string, string | number | boolean | undefined> {
  page?: number;
  limit?: number;
  q?: string;
  status?: AgentStatus;
  visibility?: PublicVisibility;
  network?: PaymentNetwork;
  sort?:
    | "createdAt"
    | "-createdAt"
    | "updatedAt"
    | "-updatedAt"
    | "name"
    | "-name";
}

export interface AgentInput {
  name: string;
  slug?: string;
  headline?: string | null;
  description?: string | null;
  avatarUrl?: string | null;
  docsUrl?: string | null;
  status?: Exclude<AgentStatus, "SUSPENDED">;
  visibility?: PublicVisibility;
  network?: PaymentNetwork;

  payerWalletId?: string | null;
  creditLimit?: string;

  walletId?: string | null;
  assetAddress?: string | null;
  priceAmount?: string | null;
  priceCurrency?: string | null;
  priceLabel?: string | null;
  endpointUrl?: string | null;
  x402Endpoint?: string | null;
}

export const getAgents = (params: ListAgentsParams = {}) =>
  httpClient.request<AgentListResponse>({
    url: "/me/agents",
    method: HttpMethod.GET,
    params,
  });

export const getAgent = (id: string) =>
  httpClient.request<Agent>({
    url: `/me/agents/${encodeURIComponent(id)}`,
    method: HttpMethod.GET,
  });

export const createAgent = (data: AgentInput) =>
  httpClient.request<Agent, typeof data>({
    url: "/me/agents",
    method: HttpMethod.POST,
    data,
  });

export const updateAgent = (id: string, data: Partial<AgentInput>) =>
  httpClient.request<Agent, typeof data>({
    url: `/me/agents/${encodeURIComponent(id)}`,
    method: HttpMethod.PATCH,
    data,
  });

export const publishAgent = (id: string) =>
  httpClient.request<Agent>({
    url: `/me/agents/${encodeURIComponent(id)}/publish`,
    method: HttpMethod.POST,
  });

export const unpublishAgent = (id: string) =>
  httpClient.request<Agent>({
    url: `/me/agents/${encodeURIComponent(id)}/unpublish`,
    method: HttpMethod.POST,
  });

export const deleteAgent = (id: string) =>
  httpClient.request<void>({
    url: `/me/agents/${encodeURIComponent(id)}`,
    method: HttpMethod.DELETE,
  });

export const batchDeleteAgents = (ids: string[]) =>
  httpClient.request<BatchDeleteResult, { ids: string[] }>({
    url: "/me/agents/batch-delete",
    method: HttpMethod.POST,
    data: { ids },
  });
