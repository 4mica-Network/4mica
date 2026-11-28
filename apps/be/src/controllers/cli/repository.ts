import { type Prisma, prisma } from "@4mica/db";
import type { CliScope } from "@auth/cli-token";
import { isUniqueViolation } from "@utils/prisma-errors";
import {
  generateCliToken,
  generateDeviceCode,
  generateUserCode,
  hashSecret,
} from "@utils/secrets";

export const DEVICE_CODE_TTL_MS = 10 * 60 * 1000;
export const DEVICE_POLL_INTERVAL_SECS = 5;
export const DEVICE_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STALE_REQUEST_MS = 24 * 60 * 60 * 1000;
const USER_CODE_ATTEMPTS = 5;

export const CLI_SESSION_SELECT = {
  id: true,
  kind: true,
  name: true,
  prefix: true,
  last4: true,
  scopes: true,
  lastUsedAt: true,
  expiresAt: true,
  createdAt: true,
  organization: { select: { id: true, name: true, handle: true } },
} as const;

const DEVICE_REQUEST_SELECT = {
  userCode: true,
  clientName: true,
  scopes: true,
  organizationId: true,
  requestIp: true,
  createdAt: true,
  expiresAt: true,
} as const;

const ORGANIZATION_SUMMARY = { id: true, name: true, handle: true } as const;

export const findOrganizationSummary = (id: string) =>
  prisma.organization.findFirst({
    where: { id, deletedAt: null },
    select: ORGANIZATION_SUMMARY,
  });

export const findOrganizationByReference = (reference: string) =>
  prisma.organization.findFirst({
    where: {
      deletedAt: null,
      ...(UUID.test(reference)
        ? { id: reference.toLowerCase() }
        : { handle: reference.toLowerCase() }),
    },
    select: ORGANIZATION_SUMMARY,
  });

export const createDeviceRequest = async (input: {
  clientName: string;
  requestIp: string;
  scopes: CliScope[];
  organizationId: string | null;
}) => {
  const deviceCode = generateDeviceCode();
  const now = Date.now();

  await prisma.cliDeviceRequest.deleteMany({
    where: { expiresAt: { lt: new Date(now - STALE_REQUEST_MS) } },
  });

  for (let attempt = 1; ; attempt += 1) {
    try {
      const request = await prisma.cliDeviceRequest.create({
        data: {
          deviceCodeHash: hashSecret(deviceCode),
          userCode: generateUserCode(),
          clientName: input.clientName,
          scopes: input.scopes,
          organizationId: input.organizationId,
          requestIp: input.requestIp,
          intervalSecs: DEVICE_POLL_INTERVAL_SECS,
          expiresAt: new Date(now + DEVICE_CODE_TTL_MS),
        },
        select: { userCode: true, expiresAt: true, intervalSecs: true },
      });

      return { deviceCode, ...request };
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === USER_CODE_ATTEMPTS) {
        throw error;
      }
    }
  }
};

export const findDeviceRequestByCode = (deviceCode: string) =>
  prisma.cliDeviceRequest.findUnique({
    where: { deviceCodeHash: hashSecret(deviceCode) },
    select: {
      id: true,
      status: true,
      userId: true,
      clientName: true,
      scopes: true,
      organizationId: true,
      mfaVerified: true,
      intervalSecs: true,
      lastPolledAt: true,
      expiresAt: true,
      consumedAt: true,
      user: { select: { banned: true, locked: true, deletedAt: true } },
    },
  });

export const claimDevicePoll = async (
  id: string,
  minGapMs: number,
): Promise<boolean> => {
  const now = Date.now();
  const { count } = await prisma.cliDeviceRequest.updateMany({
    where: {
      id,
      OR: [
        { lastPolledAt: null },
        { lastPolledAt: { lt: new Date(now - minGapMs) } },
      ],
    },
    data: { lastPolledAt: new Date(now) },
  });

  return count > 0;
};

export const redeemDeviceRequest = (request: {
  id: string;
  userId: string;
  clientName: string;
  scopes: string[];
  organizationId: string | null;
  mfaVerified: boolean;
}) =>
  prisma.$transaction(async (tx) => {
    const { count } = await tx.cliDeviceRequest.updateMany({
      where: {
        id: request.id,
        status: "APPROVED",
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });

    if (count === 0) {
      return null;
    }

    const secret = generateCliToken();
    const session = await tx.cliSession.create({
      data: {
        userId: request.userId,
        kind: "DEVICE",
        name: request.clientName,
        prefix: secret.prefix,
        last4: secret.last4,
        hashedToken: secret.hash,
        scopes: request.scopes,
        organizationId: request.organizationId,
        mfaVerified: request.mfaVerified,
        expiresAt: new Date(Date.now() + DEVICE_SESSION_TTL_MS),
      },
      select: CLI_SESSION_SELECT,
    });

    return { session, plaintext: secret.plaintext };
  });

export const findPendingDeviceRequest = (userCode: string) =>
  prisma.cliDeviceRequest.findFirst({
    where: { userCode, status: "PENDING", expiresAt: { gt: new Date() } },
    select: DEVICE_REQUEST_SELECT,
  });

export const decideDeviceRequest = async (
  userId: string,
  userCode: string,
  status: "APPROVED" | "DENIED",
  approval: { organizationId: string | null; mfaVerified: boolean } = {
    organizationId: null,
    mfaVerified: false,
  },
): Promise<boolean> => {
  const { count } = await prisma.cliDeviceRequest.updateMany({
    where: { userCode, status: "PENDING", expiresAt: { gt: new Date() } },
    data: {
      status,
      userId,
      decidedAt: new Date(),
      ...(status === "APPROVED" ? approval : {}),
    },
  });

  return count > 0;
};

export const listCliSessions = (userId: string) =>
  prisma.cliSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: CLI_SESSION_SELECT,
  });

export const createCliToken = async (
  userId: string,
  input: {
    name: string;
    scopes: CliScope[];
    expiresInDays: number;
    organizationId: string | null;
    mfaVerified: boolean;
  },
) => {
  const secret = generateCliToken();

  const session = await prisma.cliSession.create({
    data: {
      userId,
      kind: "TOKEN",
      name: input.name,
      prefix: secret.prefix,
      last4: secret.last4,
      hashedToken: secret.hash,
      scopes: input.scopes,
      organizationId: input.organizationId,
      mfaVerified: input.mfaVerified,
      expiresAt: new Date(Date.now() + input.expiresInDays * DAY_MS),
    },
    select: CLI_SESSION_SELECT,
  });

  return { session, plaintext: secret.plaintext };
};

export const revokeCliSession = async (
  userId: string,
  id: string,
): Promise<boolean> => {
  const { count } = await prisma.cliSession.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return count > 0;
};

export const findAccountSummary = (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, username: true },
  });

const liveIn = (organizationId: string) => ({
  organizationId,
  revokedAt: null,
  expiresAt: { gt: new Date() },
});

export const listOrganizationCliSessions = (organizationId: string) =>
  prisma.cliSession.findMany({
    where: liveIn(organizationId),
    orderBy: { createdAt: "desc" },
    select: {
      ...CLI_SESSION_SELECT,
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  });

export const revokeOrganizationCliSession = async (
  organizationId: string,
  id: string,
  db: Pick<Prisma.TransactionClient, "cliSession"> = prisma,
): Promise<{ userId: string } | null> => {
  const session = await db.cliSession.findFirst({
    where: { id, ...liveIn(organizationId) },
    select: { userId: true },
  });
  if (!session) {
    return null;
  }

  const { count } = await db.cliSession.updateMany({
    where: { id, organizationId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return count > 0 ? session : null;
};
