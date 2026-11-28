ALTER TABLE "cli_sessions" ADD COLUMN "mfa_verified" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "cli_device_requests" ADD COLUMN "mfa_verified" BOOLEAN NOT NULL DEFAULT false;
