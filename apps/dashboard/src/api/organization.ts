import { HttpMethod } from "@4mica/http";
import type {
  InvitationPreview,
  OrganizationList,
  OrganizationRole,
  OrganizationSummary,
} from "@stores/organization/type";
import type {
  AuditLogItem,
  Member,
  PendingInvitation,
} from "@stores/team/type";
import { httpClient } from "./client";

export const getOrganizations = () =>
  httpClient.request<OrganizationList>({
    url: "/me/organizations",
    method: HttpMethod.GET,
  });

export const createOrganization = (data: { name: string; handle: string }) =>
  httpClient.request<OrganizationSummary, typeof data>({
    url: "/me/organizations",
    method: HttpMethod.POST,
    data,
  });

export const updateOrganization = (data: { name?: string; handle?: string }) =>
  httpClient.request<OrganizationSummary, typeof data>({
    url: "/me/organization",
    method: HttpMethod.PATCH,
    data,
  });

export const deleteOrganization = () =>
  httpClient.request<void>({
    url: "/me/organization",
    method: HttpMethod.DELETE,
  });

export const leaveOrganization = () =>
  httpClient.request<void>({
    url: "/me/organization/leave",
    method: HttpMethod.POST,
  });

export const transferOrganization = (userId: string) =>
  httpClient.request<void, { userId: string }>({
    url: "/me/organization/transfer",
    method: HttpMethod.POST,
    data: { userId },
  });

export const getInvitation = (token: string) =>
  httpClient.request<InvitationPreview>({
    url: `/me/invitations/${encodeURIComponent(token)}`,
    method: HttpMethod.GET,
  });

export const acceptInvitation = (token: string) =>
  httpClient.request<{ organization: OrganizationSummary }>({
    url: `/me/invitations/${encodeURIComponent(token)}/accept`,
    method: HttpMethod.POST,
  });

export const declineInvitation = (token: string) =>
  httpClient.request<void>({
    url: `/me/invitations/${encodeURIComponent(token)}/decline`,
    method: HttpMethod.POST,
  });

export const getMembers = () =>
  httpClient.request<{ items: Member[] }>({
    url: "/me/organization/members",
    method: HttpMethod.GET,
  });

export const updateMemberRole = (userId: string, role: OrganizationRole) =>
  httpClient.request<Member, { role: OrganizationRole }>({
    url: `/me/organization/members/${encodeURIComponent(userId)}`,
    method: HttpMethod.PATCH,
    data: { role },
  });

export const removeMember = (userId: string) =>
  httpClient.request<void>({
    url: `/me/organization/members/${encodeURIComponent(userId)}`,
    method: HttpMethod.DELETE,
  });

export const getInvitations = () =>
  httpClient.request<{ items: PendingInvitation[] }>({
    url: "/me/organization/invitations",
    method: HttpMethod.GET,
  });

export const createInvitations = (data: {
  emails: string[];
  role: OrganizationRole;
}) =>
  httpClient.request<{ items: PendingInvitation[] }, typeof data>({
    url: "/me/organization/invitations",
    method: HttpMethod.POST,
    data,
  });

export const resendInvitation = (id: string) =>
  httpClient.request<PendingInvitation>({
    url: `/me/organization/invitations/${encodeURIComponent(id)}/resend`,
    method: HttpMethod.POST,
  });

export const revokeInvitation = (id: string) =>
  httpClient.request<void>({
    url: `/me/organization/invitations/${encodeURIComponent(id)}/revoke`,
    method: HttpMethod.POST,
  });

export const getAuditLogs = (params: {
  limit?: number;
  cursor?: string;
  action?: string;
}) =>
  httpClient.request<{ items: AuditLogItem[]; nextCursor: string | null }>({
    url: "/me/organization/audit-logs",
    method: HttpMethod.GET,
    params,
  });
