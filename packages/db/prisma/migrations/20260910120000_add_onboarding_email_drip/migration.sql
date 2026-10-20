-- CreateEnum
CREATE TYPE "OnboardingEmailQueueStatus" AS ENUM ('PENDING', 'SENDING', 'PAUSED', 'COMPLETED');

-- CreateTable
CREATE TABLE "onboarding_email_queue" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "OnboardingEmailQueueStatus" NOT NULL DEFAULT 'PENDING',
    "sequence_index" INTEGER NOT NULL DEFAULT 0,
    "step" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMP(3),
    "last_sent_at" TIMESTAMP(3),
    "last_provider_id" VARCHAR(128),
    "last_error" VARCHAR(512),
    "locked_until" TIMESTAMP(3),
    "lock_id" VARCHAR(64),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_email_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_email_sends" (
    "id" TEXT NOT NULL,
    "queue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "step" VARCHAR(64) NOT NULL,
    "sequence_index" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL,
    "succeeded" BOOLEAN NOT NULL DEFAULT false,
    "provider_id" VARCHAR(128),
    "error" VARCHAR(512),
    "idempotency_key" VARCHAR(256) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_email_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_email_queue_user_id_key" ON "onboarding_email_queue"("user_id");

-- CreateIndex
CREATE INDEX "onboarding_email_queue_status_next_attempt_at_idx" ON "onboarding_email_queue"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "onboarding_email_queue_status_locked_until_idx" ON "onboarding_email_queue"("status", "locked_until");

-- CreateIndex
CREATE INDEX "onboarding_email_sends_user_id_created_at_idx" ON "onboarding_email_sends"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "onboarding_email_sends_queue_id_idx" ON "onboarding_email_sends"("queue_id");

-- AddForeignKey
ALTER TABLE "onboarding_email_queue" ADD CONSTRAINT "onboarding_email_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_email_sends" ADD CONSTRAINT "onboarding_email_sends_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "onboarding_email_queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
