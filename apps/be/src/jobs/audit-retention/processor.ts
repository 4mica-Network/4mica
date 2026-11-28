import { purgeExpiredAuditLogs, retentionPolicies } from "./repository";

interface Logger {
  info(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export interface RetentionDeps {
  logger: Logger;
  now?: () => Date;
  shouldStop?: () => boolean;
}

export interface RetentionSummary {
  organizations: number;
  purged: number;
  failed: number;
}

export const runRetention = async (
  deps: RetentionDeps,
): Promise<RetentionSummary> => {
  const now = deps.now ?? (() => new Date());
  const shouldStop = deps.shouldStop ?? (() => false);
  const summary: RetentionSummary = { organizations: 0, purged: 0, failed: 0 };

  for (const policy of await retentionPolicies()) {
    if (shouldStop()) {
      break;
    }
    summary.organizations++;
    try {
      const count = await purgeExpiredAuditLogs(policy, now());
      summary.purged += count;
      if (count > 0) {
        deps.logger.info("audit retention: purged", {
          orgId: policy.organizationId,
          count,
        });
      }
    } catch (error) {
      summary.failed++;
      deps.logger.error("audit retention: purge failed", {
        orgId: policy.organizationId,
        error,
      });
    }
  }

  return summary;
};
