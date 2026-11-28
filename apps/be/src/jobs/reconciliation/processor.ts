import type { EmailClient } from "@4mica/email-client";
import {
  type ReconcileOutcome,
  type ReportedPayment,
  reconcileReportedPayment,
} from "@controllers/spend/decide";
import {
  duePayments,
  type ReconciliationBacklog,
  reconciliationBacklog,
} from "./repository";

interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export interface ReconciliationDeps {
  logger: Logger;
  email?: EmailClient | null;
  now?: () => Date;
  shouldStop?: () => boolean;
  batch?: number;
  reconcile?: (
    payment: ReportedPayment,
    email: EmailClient | null,
    now: Date,
  ) => Promise<ReconcileOutcome>;
}

export type ReconciliationSummary = Record<ReconcileOutcome, number> & {
  backlog: ReconciliationBacklog;
};

const BATCH = 200;

export const runReconciliation = async (
  deps: ReconciliationDeps,
): Promise<ReconciliationSummary> => {
  const now = deps.now ?? (() => new Date());
  const shouldStop = deps.shouldStop ?? (() => false);
  const reconcile = deps.reconcile ?? reconcileReportedPayment;
  const counts: Record<ReconcileOutcome, number> = {
    reconciled: 0,
    skipped: 0,
    failed: 0,
    unresolved: 0,
  };

  for (const payment of await duePayments(now(), deps.batch ?? BATCH)) {
    if (shouldStop()) {
      break;
    }
    const outcome = await reconcile(payment, deps.email ?? null, now());
    counts[outcome]++;
    if (outcome === "unresolved") {
      deps.logger.error("reconciliation: payment unresolved", {
        paymentId: payment.id,
      });
    }
  }

  const backlog = await reconciliationBacklog(now());
  const log = backlog.unresolved > 0 ? deps.logger.warn : deps.logger.info;
  log.call(deps.logger, "reconciliation: backlog", {
    metric: "payment_reconciliation_backlog",
    ...counts,
    ...backlog,
  });

  return { ...counts, backlog };
};
