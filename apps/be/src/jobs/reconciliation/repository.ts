import { prisma } from "@4mica/db";
import type { ReportedPayment } from "@controllers/spend/decide";
import { MATCH_PAYMENT_SELECT } from "@controllers/spend/matching";
import { amountText } from "@utils/amount";

export const duePayments = async (
  now: Date,
  limit: number,
): Promise<ReportedPayment[]> =>
  (
    await prisma.payment.findMany({
      where: { reconciliationState: "PENDING", reconcileAfter: { lte: now } },
      orderBy: [{ reconcileAfter: "asc" }, { id: "asc" }],
      take: limit,
      select: MATCH_PAYMENT_SELECT,
    })
  ).map((row) => ({ ...row, amount: amountText(row.amount) }));

export interface ReconciliationBacklog {
  pending: number;
  unresolved: number;
  oldestPendingSeconds: number | null;
  oldestUnresolvedSeconds: number | null;
}

export const reconciliationBacklog = async (
  now: Date,
): Promise<ReconciliationBacklog> => {
  const rows = await prisma.payment.groupBy({
    by: ["reconciliationState"],
    where: { reconciliationState: { in: ["PENDING", "UNRESOLVED"] } },
    _count: { _all: true },
    _min: { createdAt: true },
    orderBy: { reconciliationState: "asc" },
  });
  const of = (state: "PENDING" | "UNRESOLVED") => {
    const row = rows.find((entry) => entry.reconciliationState === state);
    const oldest = row?._min?.createdAt ?? null;
    return {
      count: (row?._count as { _all?: number } | undefined)?._all ?? 0,
      age: oldest
        ? Math.max(0, Math.round((now.getTime() - oldest.getTime()) / 1000))
        : null,
    };
  };
  const pending = of("PENDING");
  const unresolved = of("UNRESOLVED");
  return {
    pending: pending.count,
    unresolved: unresolved.count,
    oldestPendingSeconds: pending.age,
    oldestUnresolvedSeconds: unresolved.age,
  };
};
