CREATE TYPE "ExternalOperationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');

CREATE TABLE "external_operations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "kind" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(64),
    "target_id" VARCHAR(64),
    "status" "ExternalOperationStatus" NOT NULL DEFAULT 'PENDING',
    "error" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "external_operations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "external_operations_organization_id_created_at_idx" ON "external_operations"("organization_id", "created_at" DESC);

CREATE INDEX "external_operations_status_created_at_idx" ON "external_operations"("status", "created_at");
