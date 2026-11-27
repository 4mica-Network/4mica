import type { LoadStatus, OrganizationRole } from "@stores/organization/type";

export interface Member {
  userId: string;
  name: string;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: OrganizationRole;
  joinedAt: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: OrganizationRole;
  invitedBy: { id: string; name: string } | null;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
}

export interface AuditLogItem {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
  actorApiKeyId: string | null;
  actor: {
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
  } | null;
}

export interface AuditLogState {
  items: AuditLogItem[];
  nextCursor: string | null;
  action: string;
  status: LoadStatus;
  isLoadingMore: boolean;
  error: string | null;
}

export interface TeamState {
  members: Member[];
  membersStatus: LoadStatus;
  membersError: string | null;
  invitations: PendingInvitation[];
  invitationsStatus: LoadStatus;
  audit: AuditLogState;
  pending: Record<string, boolean>;
  error: string | null;
  issues: Record<string, string>;
}
