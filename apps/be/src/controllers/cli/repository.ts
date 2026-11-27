import { prisma } from "@4mica/db";
import { CLI_SCOPES } from "@auth/cli-token";
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
export const TOKEN_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

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
} as const;

const DEVICE_REQUEST_SELECT = {
  userCode: true,
  clientName: true,
  scopes: true,
  requestIp: true,
  createdAt: true,
  expiresAt: true,
} as const;

export const createDeviceRequest = async (input: {
  clientName: string;
  requestIp: string;
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
          scopes: [...CLI_SCOPES],
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
      intervalSecs: true,
      lastPolledAt: true,
      expiresAt: true,
      consumedAt: true,
      user: { select: { banned: true, locked: true, deletedAt: true } },
    },
  });

export const recordDevicePoll = (id: string) =>
  prisma.cliDeviceRequest.update({
    where: { id },
    data: { lastPolledAt: new Date() },
    select: { id: true },
  });

/**
 * Trades an approved request for a session, once. The request is claimed and
 * the session created in one transaction, so two polls racing each other
 * cannot both walk away with a token.
 */
export const redeemDeviceRequest = (request: {
  id: string;
  userId: string;
  clientName: string;
  scopes: string[];
}) =>
  prisma.$transaction(async (tx) => {
    const { count } = await tx.cliDeviceRequest.updateMany({
      where: { id: request.id, status: "APPROVED", consumedAt: null },
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
): Promise<boolean> => {
  const { count } = await prisma.cliDeviceRequest.updateMany({
    where: { userCode, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status, userId, decidedAt: new Date() },
  });

  return count > 0;
};

export const listCliSessions = (userId: string) =>
  prisma.cliSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: CLI_SESSION_SELECT,
  });

export const createCliToken = async (userId: string, name: string) => {
  const secret = generateCliToken();

  const session = await prisma.cliSession.create({
    data: {
      userId,
      kind: "TOKEN",
      name,
      prefix: secret.prefix,
      last4: secret.last4,
      hashedToken: secret.hash,
      scopes: [...CLI_SCOPES],
      expiresAt: new Date(Date.now() + TOKEN_SESSION_TTL_MS),
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
