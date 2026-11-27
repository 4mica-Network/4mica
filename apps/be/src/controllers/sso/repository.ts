import { type OrgRole, type Prisma, prisma, type SsoProvider } from "@4mica/db";

const CONNECTION_SELECT = {
  id: true,
  domainId: true,
  provider: true,
  name: true,
  clerkConnectionId: true,
  idpEntityId: true,
  idpSsoUrl: true,
  idpMetadataUrl: true,
  active: true,
  enforced: true,
  jitProvisioning: true,
  defaultRole: true,
  createdAt: true,
  domain: { select: { domain: true } },
} as const;

export type ConnectionRow = Prisma.SsoConnectionGetPayload<{
  select: typeof CONNECTION_SELECT;
}>;

export const listConnections = (orgId: string) =>
  prisma.ssoConnection.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "asc" },
    select: CONNECTION_SELECT,
  });

export const findConnection = (orgId: string, id: string) =>
  prisma.ssoConnection.findFirst({
    where: { id, organizationId: orgId },
    select: CONNECTION_SELECT,
  });

export const findVerifiedDomain = (orgId: string, id: string) =>
  prisma.organizationDomain.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, domain: true, verifiedAt: true },
  });

export const connectionForDomain = (orgId: string, domainId: string) =>
  prisma.ssoConnection.findFirst({
    where: { organizationId: orgId, domainId },
    select: { id: true },
  });

export interface ConnectionCreate {
  domainId: string;
  provider: SsoProvider;
  name: string;
  clerkConnectionId: string;
  idpEntityId: string | null;
  idpSsoUrl: string | null;
  idpMetadataUrl: string | null;
  active: boolean;
  jitProvisioning: boolean;
  defaultRole: OrgRole;
}

export const createConnection = (
  orgId: string,
  userId: string,
  data: ConnectionCreate,
) =>
  prisma.ssoConnection.create({
    data: { ...data, organizationId: orgId, createdById: userId },
    select: CONNECTION_SELECT,
  });

export const updateConnection = (
  id: string,
  data: Prisma.SsoConnectionUpdateInput,
) =>
  prisma.ssoConnection.update({
    where: { id },
    data,
    select: CONNECTION_SELECT,
  });

export const deleteConnection = (orgId: string, id: string) =>
  prisma.ssoConnection.deleteMany({ where: { id, organizationId: orgId } });

export const enforcedConnections = (orgId: string) =>
  prisma.ssoConnection.findMany({
    where: {
      organizationId: orgId,
      active: true,
      enforced: true,
      domain: { verifiedAt: { not: null } },
    },
    select: { clerkConnectionId: true, domain: { select: { domain: true } } },
  });
