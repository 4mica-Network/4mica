import { recordAudit, requireTenant } from "@controllers/shared";
import { appLogger } from "@logger/index";
import { clerk } from "@services/clerk";
import { sendCsv } from "@utils/csv";
import type { FastifyRequest, RouteHandler } from "fastify";
import { buildReport, type ClerkIdentity, CSV_HEADER, csvRows } from "./report";
import { complianceSnapshot } from "./repository";

export const CLERK_BATCH = 100;

export const clerkIdentities = async (
  clerkUserIds: string[],
): Promise<Map<string, ClerkIdentity>> => {
  const found = new Map<string, ClerkIdentity>();
  const unique = [...new Set(clerkUserIds)];

  for (let start = 0; start < unique.length; start += CLERK_BATCH) {
    const batch = unique.slice(start, start + CLERK_BATCH);
    try {
      const { data } = await clerk.users.getUserList({
        userId: batch,
        limit: CLERK_BATCH,
      });
      for (const user of data) {
        found.set(user.id, {
          twoFactorEnabled: user.twoFactorEnabled,
          samlConnectionIds: (user.samlAccounts ?? []).flatMap((account) =>
            account.samlConnection?.id ? [account.samlConnection.id] : [],
          ),
        });
      }
    } catch (error) {
      appLogger.warn("Could not read MFA status from Clerk", {
        users: batch.length,
        error,
      });
    }
  }

  return found;
};

const generate = async (orgId: string) => {
  const now = new Date();
  const snapshot = await complianceSnapshot(orgId, now);
  const identities = await clerkIdentities(
    snapshot.memberships
      .filter((member) => member.suspendedAt === null)
      .map((member) => member.user.clerkUserId),
  );
  return buildReport(snapshot, identities, now);
};

const recordExport = (
  request: FastifyRequest,
  tenant: Parameters<typeof recordAudit>[1],
  format: "json" | "csv",
  report: Awaited<ReturnType<typeof generate>>,
) =>
  recordAudit(request, tenant, {
    action: "report.exported",
    targetType: "report",
    targetId: "compliance",
    metadata: {
      report: "compliance",
      format,
      checks: Object.fromEntries(
        report.checks.map((check) => [check.id, check.status]),
      ),
    },
  });

export const complianceReportHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "compliance.read");
  if (!tenant) {
    return reply;
  }

  const report = await generate(tenant.orgId);
  await recordExport(request, tenant, "json", report);
  return reply.header("cache-control", "no-store").send(report);
};

export const complianceReportCsvHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "compliance.read");
  if (!tenant) {
    return reply;
  }

  const report = await generate(tenant.orgId);
  await recordExport(request, tenant, "csv", report);
  return sendCsv(
    reply,
    `compliance-report-${report.generatedAt.toISOString().slice(0, 10)}.csv`,
    CSV_HEADER,
    csvRows(report),
    false,
  );
};
