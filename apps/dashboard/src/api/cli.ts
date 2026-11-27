import { HttpMethod } from "@4mica/http";
import type { CliSession, NewCliToken } from "@stores/developer/type";
import { httpClient } from "./client";

export interface CliOrganization {
  id: string;
  name: string;
  handle: string | null;
}

export interface CliDeviceRequest {
  userCode: string;
  clientName: string;
  scopes: string[];
  organization?: CliOrganization | null;
  requestIp: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface CreatedCliToken {
  session: CliSession;
  plaintext: string;
}

export const getCliDeviceRequest = (userCode: string) =>
  httpClient.request<CliDeviceRequest>({
    url: `/me/cli/device?userCode=${encodeURIComponent(userCode)}`,
    method: HttpMethod.GET,
  });

export const approveCliDeviceRequest = (
  userCode: string,
  organizationId?: string,
) =>
  httpClient.request<void, { userCode: string; organizationId?: string }>({
    url: "/me/cli/device/approve",
    method: HttpMethod.POST,
    data: organizationId ? { userCode, organizationId } : { userCode },
  });

export const denyCliDeviceRequest = (userCode: string) =>
  httpClient.request<void, { userCode: string }>({
    url: "/me/cli/device/deny",
    method: HttpMethod.POST,
    data: { userCode },
  });

export const getCliSessions = () =>
  httpClient.request<CliSession[]>({
    url: "/me/cli/sessions",
    method: HttpMethod.GET,
  });

export const createCliToken = (data: NewCliToken) =>
  httpClient.request<CreatedCliToken, typeof data>({
    url: "/me/cli/sessions",
    method: HttpMethod.POST,
    data,
  });

export const revokeCliSession = (id: string) =>
  httpClient.request<void>({
    url: `/me/cli/sessions/${encodeURIComponent(id)}`,
    method: HttpMethod.DELETE,
  });
