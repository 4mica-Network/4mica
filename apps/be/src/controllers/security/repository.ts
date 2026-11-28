import { type Prisma, prisma } from "@4mica/db";

export interface SecuritySettingsRow {
  requireMfa: boolean;
  sessionMaxAgeHours: number | null;
  reauthWindowMinutes: number;
  ipAllowlist: string[];
  enforceIpAllowlistForApiKeys: boolean;
}

export const DEFAULT_SECURITY_SETTINGS: SecuritySettingsRow = {
  requireMfa: false,
  sessionMaxAgeHours: null,
  reauthWindowMinutes: 15,
  ipAllowlist: [],
  enforceIpAllowlistForApiKeys: false,
};

const SELECT = {
  requireMfa: true,
  sessionMaxAgeHours: true,
  reauthWindowMinutes: true,
  ipAllowlist: true,
  enforceIpAllowlistForApiKeys: true,
} as const;

export const findSecuritySettings = async (
  orgId: string,
): Promise<SecuritySettingsRow> =>
  (await prisma.securitySettings.findUnique({
    where: { organizationId: orgId },
    select: SELECT,
  })) ?? DEFAULT_SECURITY_SETTINGS;

export const saveSecuritySettings = (
  orgId: string,
  settings: SecuritySettingsRow,
  db: Prisma.TransactionClient = prisma,
): Promise<SecuritySettingsRow> =>
  db.securitySettings.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...settings },
    update: settings,
    select: SELECT,
  });
