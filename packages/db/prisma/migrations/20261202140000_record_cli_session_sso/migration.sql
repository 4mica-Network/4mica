ALTER TABLE "cli_sessions" ADD COLUMN "clerk_sso_connection_id" TEXT;

ALTER TABLE "cli_device_requests" ADD COLUMN "clerk_sso_connection_id" TEXT;
