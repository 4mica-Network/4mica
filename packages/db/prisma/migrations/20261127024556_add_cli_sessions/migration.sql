-- CreateEnum
CREATE TYPE "CliSessionKind" AS ENUM ('DEVICE', 'TOKEN');

-- CreateEnum
CREATE TYPE "CliDeviceRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateTable
CREATE TABLE "cli_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "CliSessionKind" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "prefix" VARCHAR(32) NOT NULL,
    "last4" VARCHAR(4) NOT NULL,
    "hashed_token" TEXT NOT NULL,
    "scopes" TEXT[],
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cli_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cli_device_requests" (
    "id" TEXT NOT NULL,
    "device_code_hash" TEXT NOT NULL,
    "user_code" VARCHAR(16) NOT NULL,
    "client_name" VARCHAR(120) NOT NULL,
    "scopes" TEXT[],
    "status" "CliDeviceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "user_id" TEXT,
    "request_ip" VARCHAR(64),
    "interval_secs" INTEGER NOT NULL,
    "last_polled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cli_device_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cli_sessions_hashed_token_key" ON "cli_sessions"("hashed_token");

-- CreateIndex
CREATE INDEX "cli_sessions_user_id_created_at_idx" ON "cli_sessions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "cli_device_requests_device_code_hash_key" ON "cli_device_requests"("device_code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "cli_device_requests_user_code_key" ON "cli_device_requests"("user_code");

-- CreateIndex
CREATE INDEX "cli_device_requests_user_id_idx" ON "cli_device_requests"("user_id");

-- CreateIndex
CREATE INDEX "cli_device_requests_expires_at_idx" ON "cli_device_requests"("expires_at");

-- AddForeignKey
ALTER TABLE "cli_sessions" ADD CONSTRAINT "cli_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_device_requests" ADD CONSTRAINT "cli_device_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
