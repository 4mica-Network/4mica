CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "handle" VARCHAR(64),
    "name" VARCHAR(120) NOT NULL DEFAULT '',
    "avatar_url" TEXT,
    "personal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "token_hash" TEXT NOT NULL,
    "invited_by_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_api_key_id" TEXT,
    "action" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(64),
    "target_id" VARCHAR(64),
    "metadata" JSONB,
    "ip" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_handle_key" ON "organizations"("handle");
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE INDEX "invitations_organization_id_created_at_idx" ON "invitations"("organization_id", "created_at" DESC);
CREATE INDEX "invitations_email_idx" ON "invitations"("email");
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at" DESC);
CREATE INDEX "audit_logs_organization_id_action_created_at_idx" ON "audit_logs"("organization_id", "action", "created_at" DESC);

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One personal organization per existing user, owned by that user. Its handle
-- is the user's username so public profile URLs do not change.
CREATE TEMPORARY TABLE "_personal_orgs" AS
SELECT "id" AS "user_id", gen_random_uuid()::text AS "organization_id", "username", "name", "avatar_url", "created_at"
FROM "users";

INSERT INTO "organizations" ("id", "handle", "name", "avatar_url", "personal", "created_at", "updated_at")
SELECT "organization_id", "username", "name", "avatar_url", true, "created_at", CURRENT_TIMESTAMP
FROM "_personal_orgs";

INSERT INTO "memberships" ("id", "organization_id", "user_id", "role", "created_at", "updated_at")
SELECT gen_random_uuid()::text, "organization_id", "user_id", 'OWNER', "created_at", CURRENT_TIMESTAMP
FROM "_personal_orgs";

ALTER TABLE "users" ADD COLUMN "default_organization_id" TEXT;
UPDATE "users" u SET "default_organization_id" = p."organization_id"
FROM "_personal_orgs" p WHERE p."user_id" = u."id";
ALTER TABLE "users" ADD CONSTRAINT "users_default_organization_id_fkey" FOREIGN KEY ("default_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Move every business resource from its user to that user's personal organization.
ALTER TABLE "agents" DROP CONSTRAINT "agents_owner_id_fkey";
ALTER TABLE "agents" ADD COLUMN "organization_id" TEXT;
UPDATE "agents" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "agents" RENAME COLUMN "owner_id" TO "created_by_id";
ALTER TABLE "agents" ALTER COLUMN "created_by_id" DROP NOT NULL;

ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_owner_id_fkey";
ALTER TABLE "api_keys" ADD COLUMN "organization_id" TEXT;
UPDATE "api_keys" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "api_keys" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "api_keys" RENAME COLUMN "owner_id" TO "created_by_id";
ALTER TABLE "api_keys" ALTER COLUMN "created_by_id" DROP NOT NULL;

ALTER TABLE "api_listings" DROP CONSTRAINT "api_listings_owner_id_fkey";
ALTER TABLE "api_listings" ADD COLUMN "organization_id" TEXT;
UPDATE "api_listings" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "api_listings" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "api_listings" RENAME COLUMN "owner_id" TO "created_by_id";
ALTER TABLE "api_listings" ALTER COLUMN "created_by_id" DROP NOT NULL;

ALTER TABLE "customers" DROP CONSTRAINT "customers_owner_id_fkey";
ALTER TABLE "customers" ADD COLUMN "organization_id" TEXT;
UPDATE "customers" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "customers" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "customers" RENAME COLUMN "owner_id" TO "created_by_id";
ALTER TABLE "customers" ALTER COLUMN "created_by_id" DROP NOT NULL;

ALTER TABLE "support_requests" DROP CONSTRAINT "support_requests_owner_id_fkey";
ALTER TABLE "support_requests" ADD COLUMN "organization_id" TEXT;
UPDATE "support_requests" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "support_requests" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "support_requests" RENAME COLUMN "owner_id" TO "created_by_id";
ALTER TABLE "support_requests" ALTER COLUMN "created_by_id" DROP NOT NULL;

ALTER TABLE "wallets" DROP CONSTRAINT "wallets_owner_id_fkey";
ALTER TABLE "wallets" ADD COLUMN "organization_id" TEXT;
UPDATE "wallets" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "wallets" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "wallets" RENAME COLUMN "owner_id" TO "created_by_id";
ALTER TABLE "wallets" ALTER COLUMN "created_by_id" DROP NOT NULL;

ALTER TABLE "webhooks" DROP CONSTRAINT "webhooks_owner_id_fkey";
ALTER TABLE "webhooks" ADD COLUMN "organization_id" TEXT;
UPDATE "webhooks" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "webhooks" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "webhooks" RENAME COLUMN "owner_id" TO "created_by_id";
ALTER TABLE "webhooks" ALTER COLUMN "created_by_id" DROP NOT NULL;

ALTER TABLE "beneficial_owners" DROP CONSTRAINT "beneficial_owners_owner_id_fkey";
ALTER TABLE "beneficial_owners" ADD COLUMN "organization_id" TEXT;
UPDATE "beneficial_owners" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "beneficial_owners" ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "businesses" DROP CONSTRAINT "businesses_owner_id_fkey";
ALTER TABLE "businesses" ADD COLUMN "organization_id" TEXT;
UPDATE "businesses" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "businesses" ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "compliance_profiles" DROP CONSTRAINT "compliance_profiles_owner_id_fkey";
ALTER TABLE "compliance_profiles" ADD COLUMN "organization_id" TEXT;
UPDATE "compliance_profiles" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "compliance_profiles" ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "customer_coupons" DROP CONSTRAINT "customer_coupons_owner_id_fkey";
ALTER TABLE "customer_coupons" ADD COLUMN "organization_id" TEXT;
UPDATE "customer_coupons" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "customer_coupons" ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "customer_credit_entries" DROP CONSTRAINT "customer_credit_entries_owner_id_fkey";
ALTER TABLE "customer_credit_entries" ADD COLUMN "organization_id" TEXT;
UPDATE "customer_credit_entries" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "customer_credit_entries" ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "customer_payment_identities" DROP CONSTRAINT "customer_payment_identities_owner_id_fkey";
ALTER TABLE "customer_payment_identities" ADD COLUMN "organization_id" TEXT;
UPDATE "customer_payment_identities" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "customer_payment_identities" ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "payments" DROP CONSTRAINT "payments_owner_id_fkey";
ALTER TABLE "payments" ADD COLUMN "organization_id" TEXT;
UPDATE "payments" r SET "organization_id" = p."organization_id" FROM "_personal_orgs" p WHERE p."user_id" = r."owner_id";
ALTER TABLE "payments" ALTER COLUMN "organization_id" SET NOT NULL;

DROP INDEX "agents_owner_id_slug_key";
DROP INDEX "agents_owner_id_visibility_idx";
DROP INDEX "api_keys_owner_id_idx";
DROP INDEX "api_listings_owner_id_slug_key";
DROP INDEX "api_listings_owner_id_visibility_idx";
DROP INDEX "beneficial_owners_owner_id_idx";
DROP INDEX "businesses_owner_id_key";
DROP INDEX "compliance_profiles_owner_id_key";
DROP INDEX "customer_coupons_owner_id_code_key";
DROP INDEX "customer_payment_identities_owner_id_network_address_key";
DROP INDEX "customer_payment_identities_owner_id_type_value_key";
DROP INDEX "customers_owner_id_created_at_idx";
DROP INDEX "customers_owner_id_status_idx";
DROP INDEX "payments_owner_id_created_at_idx";
DROP INDEX "payments_owner_id_req_id_key";
DROP INDEX "support_requests_owner_id_last_activity_at_idx";
DROP INDEX "support_requests_owner_id_status_idx";
DROP INDEX "wallets_owner_id_address_network_key";
DROP INDEX "wallets_owner_id_created_at_idx";
DROP INDEX "webhooks_owner_id_idx";

ALTER TABLE "beneficial_owners" DROP COLUMN "owner_id";
ALTER TABLE "businesses" DROP COLUMN "owner_id";
ALTER TABLE "compliance_profiles" DROP COLUMN "owner_id";
ALTER TABLE "customer_coupons" DROP COLUMN "owner_id";
ALTER TABLE "customer_credit_entries" DROP COLUMN "owner_id";
ALTER TABLE "customer_payment_identities" DROP COLUMN "owner_id";
ALTER TABLE "payments" DROP COLUMN "owner_id";

CREATE INDEX "agents_organization_id_visibility_idx" ON "agents"("organization_id", "visibility");
CREATE UNIQUE INDEX "agents_organization_id_slug_key" ON "agents"("organization_id", "slug");
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");
CREATE INDEX "api_listings_organization_id_visibility_idx" ON "api_listings"("organization_id", "visibility");
CREATE UNIQUE INDEX "api_listings_organization_id_slug_key" ON "api_listings"("organization_id", "slug");
CREATE INDEX "beneficial_owners_organization_id_idx" ON "beneficial_owners"("organization_id");
CREATE UNIQUE INDEX "businesses_organization_id_key" ON "businesses"("organization_id");
CREATE UNIQUE INDEX "compliance_profiles_organization_id_key" ON "compliance_profiles"("organization_id");
CREATE UNIQUE INDEX "customer_coupons_organization_id_code_key" ON "customer_coupons"("organization_id", "code");
CREATE UNIQUE INDEX "customer_payment_identities_organization_id_network_address_key" ON "customer_payment_identities"("organization_id", "network", "address");
CREATE UNIQUE INDEX "customer_payment_identities_organization_id_type_value_key" ON "customer_payment_identities"("organization_id", "type", "value");
CREATE INDEX "customers_organization_id_created_at_idx" ON "customers"("organization_id", "created_at" DESC);
CREATE INDEX "customers_organization_id_status_idx" ON "customers"("organization_id", "status");
CREATE INDEX "payments_organization_id_created_at_idx" ON "payments"("organization_id", "created_at" DESC);
CREATE UNIQUE INDEX "payments_organization_id_req_id_key" ON "payments"("organization_id", "req_id");
CREATE INDEX "support_requests_organization_id_last_activity_at_idx" ON "support_requests"("organization_id", "last_activity_at" DESC);
CREATE INDEX "support_requests_organization_id_status_idx" ON "support_requests"("organization_id", "status");
CREATE INDEX "wallets_organization_id_created_at_idx" ON "wallets"("organization_id", "created_at" DESC);
CREATE UNIQUE INDEX "wallets_organization_id_address_network_key" ON "wallets"("organization_id", "address", "network");
CREATE INDEX "webhooks_organization_id_idx" ON "webhooks"("organization_id");

ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "api_listings" ADD CONSTRAINT "api_listings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_listings" ADD CONSTRAINT "api_listings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_coupons" ADD CONSTRAINT "customer_coupons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_credit_entries" ADD CONSTRAINT "customer_credit_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_payment_identities" ADD CONSTRAINT "customer_payment_identities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "compliance_profiles" ADD CONSTRAINT "compliance_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "beneficial_owners" ADD CONSTRAINT "beneficial_owners_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX "wallets_owner_network_default_key";
CREATE UNIQUE INDEX "wallets_organization_network_default_key"
    ON "wallets" ("organization_id", "network") WHERE "is_default";

CREATE FUNCTION "audit_logs_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"();

DROP TABLE "_personal_orgs";
