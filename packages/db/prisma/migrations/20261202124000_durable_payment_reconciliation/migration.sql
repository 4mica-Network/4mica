CREATE TYPE "ReconciliationState" AS ENUM ('PENDING', 'RECONCILED', 'UNRESOLVED');

ALTER TABLE "payments" ADD COLUMN "reconciliation_state" "ReconciliationState" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "reconcile_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reconcile_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "reconcile_error" VARCHAR(500),
ADD COLUMN "reconciled_at" TIMESTAMP(3);

UPDATE "payments"
   SET "reconciliation_state" = 'RECONCILED',
       "reconciled_at" = "updated_at"
 WHERE "status" = 'FAILED'
    OR "created_at" < CURRENT_TIMESTAMP - INTERVAL '7 days';

CREATE INDEX "payments_reconciliation_state_reconcile_after_idx" ON "payments"("reconciliation_state", "reconcile_after");
