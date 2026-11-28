CREATE TYPE "MembershipSource" AS ENUM ('INVITATION', 'CREATOR', 'SCIM', 'DOMAIN');

CREATE TYPE "SsoProvider" AS ENUM ('OKTA', 'MICROSOFT_ENTRA', 'GOOGLE_WORKSPACE', 'CUSTOM');

CREATE TYPE "AuditStreamStatus" AS ENUM ('ACTIVE', 'PAUSED', 'FAILING');

ALTER TABLE "api_keys" ADD COLUMN     "ip_allowlist" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "memberships" ADD COLUMN     "custom_role_id" TEXT,
ADD COLUMN     "scim_external_id" VARCHAR(255),
ADD COLUMN     "source" "MembershipSource" NOT NULL DEFAULT 'INVITATION',
ADD COLUMN     "suspended_at" TIMESTAMP(3);

CREATE TABLE "organization_domains" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "domain" VARCHAR(253) NOT NULL,
    "verification_token" VARCHAR(64) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "auto_join" BOOLEAN NOT NULL DEFAULT false,
    "auto_join_role" "OrgRole" NOT NULL DEFAULT 'VIEWER',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_domains_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sso_connections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "domain_id" TEXT NOT NULL,
    "provider" "SsoProvider" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "clerk_connection_id" TEXT,
    "idp_entity_id" VARCHAR(2048),
    "idp_sso_url" VARCHAR(2048),
    "idp_metadata_url" VARCHAR(2048),
    "active" BOOLEAN NOT NULL DEFAULT false,
    "enforced" BOOLEAN NOT NULL DEFAULT false,
    "jit_provisioning" BOOLEAN NOT NULL DEFAULT true,
    "default_role" "OrgRole" NOT NULL DEFAULT 'VIEWER',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_settings" (
    "organization_id" TEXT NOT NULL,
    "require_mfa" BOOLEAN NOT NULL DEFAULT false,
    "session_max_age_hours" INTEGER,
    "reauth_window_minutes" INTEGER NOT NULL DEFAULT 15,
    "ip_allowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enforce_ip_allowlist_for_api_keys" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_settings_pkey" PRIMARY KEY ("organization_id")
);

CREATE TABLE "custom_roles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(280),
    "permissions" TEXT[],
    "project_role" "ProjectRole" NOT NULL DEFAULT 'VIEWER',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scim_tokens" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "prefix" VARCHAR(32) NOT NULL,
    "last4" VARCHAR(4) NOT NULL,
    "hashed_token" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scim_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scim_groups" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "external_id" VARCHAR(255),
    "display_name" VARCHAR(255) NOT NULL,
    "role" "OrgRole",
    "custom_role_id" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scim_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scim_group_members" (
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scim_group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

CREATE TABLE "audit_streams" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "status" "AuditStreamStatus" NOT NULL DEFAULT 'ACTIVE',
    "secret_version" INTEGER NOT NULL DEFAULT 1,
    "action_prefixes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cursor_id" TEXT,
    "last_delivery_at" TIMESTAMP(3),
    "last_status_code" INTEGER,
    "last_error" VARCHAR(500),
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "audit_streams_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organization_domains_domain_idx" ON "organization_domains"("domain");

CREATE UNIQUE INDEX "organization_domains_organization_id_domain_key" ON "organization_domains"("organization_id", "domain");

CREATE UNIQUE INDEX "sso_connections_clerk_connection_id_key" ON "sso_connections"("clerk_connection_id");

CREATE INDEX "sso_connections_organization_id_idx" ON "sso_connections"("organization_id");

CREATE UNIQUE INDEX "custom_roles_organization_id_name_key" ON "custom_roles"("organization_id", "name");

CREATE UNIQUE INDEX "scim_tokens_hashed_token_key" ON "scim_tokens"("hashed_token");

CREATE INDEX "scim_tokens_organization_id_idx" ON "scim_tokens"("organization_id");

CREATE INDEX "scim_groups_organization_id_external_id_idx" ON "scim_groups"("organization_id", "external_id");

CREATE UNIQUE INDEX "scim_groups_organization_id_display_name_key" ON "scim_groups"("organization_id", "display_name");

CREATE INDEX "scim_group_members_user_id_idx" ON "scim_group_members"("user_id");

CREATE INDEX "audit_streams_organization_id_idx" ON "audit_streams"("organization_id");

CREATE INDEX "audit_streams_status_next_attempt_at_idx" ON "audit_streams"("status", "next_attempt_at");

CREATE INDEX "memberships_organization_id_scim_external_id_idx" ON "memberships"("organization_id", "scim_external_id");

ALTER TABLE "organization_domains" ADD CONSTRAINT "organization_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_domains" ADD CONSTRAINT "organization_domains_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "organization_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "security_settings" ADD CONSTRAINT "security_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "scim_tokens" ADD CONSTRAINT "scim_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scim_tokens" ADD CONSTRAINT "scim_tokens_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "scim_groups" ADD CONSTRAINT "scim_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scim_groups" ADD CONSTRAINT "scim_groups_custom_role_id_fkey" FOREIGN KEY ("custom_role_id") REFERENCES "custom_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "scim_group_members" ADD CONSTRAINT "scim_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "scim_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scim_group_members" ADD CONSTRAINT "scim_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_streams" ADD CONSTRAINT "audit_streams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_streams" ADD CONSTRAINT "audit_streams_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_custom_role_id_fkey" FOREIGN KEY ("custom_role_id") REFERENCES "custom_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "organization_domains_verified_domain_key"
    ON "organization_domains" ("domain") WHERE "verified_at" IS NOT NULL;

UPDATE "memberships" m SET "source" = 'CREATOR'
FROM "organizations" o
WHERE o."id" = m."organization_id" AND o."personal" AND m."role" = 'OWNER';
