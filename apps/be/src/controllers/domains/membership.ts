import { appLogger } from "@logger/index";
import {
  getClerkUser,
  samlConnectionIds,
  verifiedEmailDomains,
} from "@services/clerk-users";
import { isUniqueViolation } from "@utils/prisma-errors";
import type { FastifyRequest } from "fastify";
import {
  autoJoinDomains,
  departedFrom,
  existingMemberships,
  type JoinCandidate,
  jitConnections,
  joinOrganization,
} from "./repository";

const candidatesFor = async (clerkUserId: string) => {
  const user = await getClerkUser(clerkUserId);
  const [domains, connections] = await Promise.all([
    autoJoinDomains(verifiedEmailDomains(user)),
    jitConnections(samlConnectionIds(user)),
  ]);

  const byOrg = new Map<string, JoinCandidate>();
  for (const row of connections) {
    byOrg.set(row.organizationId, {
      orgId: row.organizationId,
      role: row.defaultRole,
      via: "sso",
      sourceId: row.id,
    });
  }
  for (const row of domains) {
    if (!byOrg.has(row.organizationId)) {
      byOrg.set(row.organizationId, {
        orgId: row.organizationId,
        role: row.autoJoinRole,
        via: "domain",
        sourceId: row.id,
      });
    }
  }
  return [...byOrg.values()].filter((candidate) => candidate.role !== "OWNER");
};

export const ensureIdentityMemberships = async (
  request: FastifyRequest,
  userId: string,
): Promise<number> => {
  const clerkUserId = request.user?.clerkUserId;
  if (!clerkUserId) {
    return 0;
  }

  try {
    const candidates = await candidatesFor(clerkUserId);
    if (candidates.length === 0) {
      return 0;
    }

    const orgIds = candidates.map((candidate) => candidate.orgId);
    const [existing, departed] = await Promise.all([
      existingMemberships(userId, orgIds),
      departedFrom(userId, orgIds),
    ]);

    let joined = 0;
    for (const candidate of candidates) {
      if (existing.has(candidate.orgId) || departed.has(candidate.orgId)) {
        continue;
      }
      try {
        await joinOrganization(userId, candidate, request.ip);
        joined += 1;
        appLogger.info("Member joined through verified identity", {
          userId,
          orgId: candidate.orgId,
          via: candidate.via,
        });
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
      }
    }
    return joined;
  } catch (error) {
    appLogger.warn("Could not provision identity memberships", {
      userId,
      error,
    });
    return 0;
  }
};
