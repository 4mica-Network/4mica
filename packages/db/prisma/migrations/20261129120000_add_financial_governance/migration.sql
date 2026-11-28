CREATE TYPE "SpendingPolicyScope" AS ENUM ('ORGANIZATION', 'PROJECT', 'AGENT', 'API_KEY');

CREATE TYPE "SpendingPolicyMode" AS ENUM ('ENFORCE', 'MONITOR');

CREATE TYPE "SpendAuthorizationStatus" AS ENUM ('RESERVED', 'PENDING_APPROVAL', 'CONSUMED', 'RELEASED', 'EXPIRED', 'DENIED');

CREATE TYPE "ApprovalKind" AS ENUM ('PAYMENT', 'SELLER_PAYMENT', 'GOVERNANCE');

CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

CREATE TYPE "ApprovalVote" AS ENUM ('APPROVE', 'REJECT');

CREATE TYPE "FinancialAlertKind" AS ENUM ('BUDGET_THRESHOLD', 'UNAUTHORIZED_SPEND', 'POLICY_DENIAL', 'APPROVAL_REQUESTED');

ALTER TYPE "ApiKeyScope" ADD VALUE 'SPEND_AUTHORIZE';
ALTER TYPE "ApiKeyScope" ADD VALUE 'APPROVALS_WRITE';

ALTER TYPE "OrgRole" ADD VALUE 'FINANCE';

ALTER TABLE "audit_logs" ADD COLUMN     "project_id" TEXT;

ALTER TABLE "customers" ADD COLUMN     "limit_asset_address" VARCHAR(42),
ADD COLUMN     "limit_network" "PaymentNetwork";

ALTER TABLE "payments" ADD COLUMN     "api_key_id" TEXT;

CREATE TABLE "spending_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "scope" "SpendingPolicyScope" NOT NULL,
    "project_id" TEXT,
    "agent_id" TEXT,
    "api_key_id" TEXT,
    "mode" "SpendingPolicyMode" NOT NULL DEFAULT 'ENFORCE',
    "network" "PaymentNetwork",
    "asset_address" VARCHAR(42),
    "per_payment_limit" DECIMAL(38,18),
    "daily_limit" DECIMAL(38,18),
    "monthly_limit" DECIMAL(38,18),
    "approval_threshold" DECIMAL(38,18),
    "approvals_required" INTEGER NOT NULL DEFAULT 1,
    "allowed_recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alert_thresholds" INTEGER[] DEFAULT ARRAY[80, 100]::INTEGER[],
    "frozen_at" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "spending_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spend_authorizations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "environment" "EnvironmentKind" NOT NULL,
    "api_key_id" TEXT,
    "agent_id" TEXT,
    "network" "PaymentNetwork" NOT NULL,
    "asset_address" VARCHAR(42),
    "payer_address" VARCHAR(42) NOT NULL,
    "recipient_address" VARCHAR(42) NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "req_id" VARCHAR(66),
    "status" "SpendAuthorizationStatus" NOT NULL,
    "denied_reason" VARCHAR(64),
    "policy_id" TEXT,
    "approval_request_id" TEXT,
    "payment_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spend_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT,
    "kind" "ApprovalKind" NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "summary" VARCHAR(280) NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" VARCHAR(64) NOT NULL,
    "requested_by_id" TEXT,
    "requested_by_api_key_id" TEXT,
    "required_approvals" INTEGER NOT NULL DEFAULT 1,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_decisions" (
    "id" TEXT NOT NULL,
    "approval_request_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vote" "ApprovalVote" NOT NULL,
    "comment" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "governance_settings" (
    "organization_id" TEXT NOT NULL,
    "approvals_required" INTEGER NOT NULL DEFAULT 0,
    "governed_actions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approval_ttl_hours" INTEGER NOT NULL DEFAULT 72,
    "finance_recipient_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audit_retention_days" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_settings_pkey" PRIMARY KEY ("organization_id")
);

CREATE TABLE "financial_alerts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT,
    "kind" "FinancialAlertKind" NOT NULL,
    "policy_id" TEXT,
    "title" VARCHAR(160) NOT NULL,
    "detail" JSONB NOT NULL,
    "dedupe_key" VARCHAR(160),
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "spending_policies_organization_id_scope_idx" ON "spending_policies"("organization_id", "scope");

CREATE INDEX "spending_policies_project_id_idx" ON "spending_policies"("project_id");

CREATE INDEX "spending_policies_agent_id_idx" ON "spending_policies"("agent_id");

CREATE INDEX "spending_policies_api_key_id_idx" ON "spending_policies"("api_key_id");

CREATE UNIQUE INDEX "spend_authorizations_approval_request_id_key" ON "spend_authorizations"("approval_request_id");

CREATE INDEX "spend_authorizations_organization_id_network_asset_address__idx" ON "spend_authorizations"("organization_id", "network", "asset_address", "created_at");

CREATE INDEX "spend_authorizations_organization_id_req_id_idx" ON "spend_authorizations"("organization_id", "req_id");

CREATE INDEX "spend_authorizations_api_key_id_created_at_idx" ON "spend_authorizations"("api_key_id", "created_at");

CREATE INDEX "spend_authorizations_agent_id_created_at_idx" ON "spend_authorizations"("agent_id", "created_at");

CREATE INDEX "approval_requests_organization_id_status_created_at_idx" ON "approval_requests"("organization_id", "status", "created_at" DESC);

CREATE INDEX "approval_requests_organization_id_action_payload_hash_idx" ON "approval_requests"("organization_id", "action", "payload_hash");

CREATE UNIQUE INDEX "approval_decisions_approval_request_id_user_id_key" ON "approval_decisions"("approval_request_id", "user_id");

CREATE INDEX "financial_alerts_organization_id_created_at_idx" ON "financial_alerts"("organization_id", "created_at" DESC);

CREATE UNIQUE INDEX "financial_alerts_organization_id_dedupe_key_key" ON "financial_alerts"("organization_id", "dedupe_key");

CREATE INDEX "audit_logs_organization_id_project_id_created_at_idx" ON "audit_logs"("organization_id", "project_id", "created_at" DESC);

CREATE INDEX "payments_api_key_id_created_at_idx" ON "payments"("api_key_id", "created_at" DESC);

ALTER TABLE "spending_policies" ADD CONSTRAINT "spending_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spending_policies" ADD CONSTRAINT "spending_policies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spending_policies" ADD CONSTRAINT "spending_policies_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spending_policies" ADD CONSTRAINT "spending_policies_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spending_policies" ADD CONSTRAINT "spending_policies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "spend_authorizations" ADD CONSTRAINT "spend_authorizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spend_authorizations" ADD CONSTRAINT "spend_authorizations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spend_authorizations" ADD CONSTRAINT "spend_authorizations_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "spend_authorizations" ADD CONSTRAINT "spend_authorizations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "spend_authorizations" ADD CONSTRAINT "spend_authorizations_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "spending_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "spend_authorizations" ADD CONSTRAINT "spend_authorizations_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "governance_settings" ADD CONSTRAINT "governance_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "financial_alerts" ADD CONSTRAINT "financial_alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "financial_alerts" ADD CONSTRAINT "financial_alerts_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "spending_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_append_only";
UPDATE "audit_logs" SET "project_id" = "metadata"->>'projectId'
WHERE "metadata" ? 'projectId' AND jsonb_typeof("metadata"->'projectId') = 'string';
ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_append_only";

CREATE OR REPLACE FUNCTION "audit_logs_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('fourmica.audit_retention', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;
