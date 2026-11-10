-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('ACCOUNT', 'BILLING', 'PAYMENTS', 'WALLETS', 'AGENTS', 'API_LISTINGS', 'INTEGRATION', 'COMPLIANCE', 'BUG', 'FEATURE_REQUEST', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportAuthor" AS ENUM ('CUSTOMER', 'SUPPORT');

-- CreateTable
CREATE TABLE "support_requests" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "owner_id" TEXT NOT NULL,
    "subject" VARCHAR(160) NOT NULL,
    "category" "SupportCategory" NOT NULL,
    "priority" "SupportPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
    "description" VARCHAR(5000) NOT NULL,
    "reference" VARCHAR(255),
    "first_responded_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "author" "SupportAuthor" NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- AlterSequence
ALTER SEQUENCE "support_requests_number_seq" RESTART WITH 1001;

-- CreateIndex
CREATE UNIQUE INDEX "support_requests_number_key" ON "support_requests"("number");

-- CreateIndex
CREATE INDEX "support_requests_owner_id_last_activity_at_idx" ON "support_requests"("owner_id", "last_activity_at" DESC);

-- CreateIndex
CREATE INDEX "support_requests_owner_id_status_idx" ON "support_requests"("owner_id", "status");

-- CreateIndex
CREATE INDEX "support_messages_request_id_created_at_idx" ON "support_messages"("request_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "support_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

