ALTER TYPE "OrgRole" RENAME VALUE 'MEMBER' TO 'DEVELOPER';
ALTER TYPE "OrgRole" ADD VALUE 'VIEWER';
ALTER TABLE "memberships" ALTER COLUMN "role" SET DEFAULT 'DEVELOPER';
ALTER TABLE "invitations" ALTER COLUMN "role" SET DEFAULT 'DEVELOPER';

CREATE TYPE "ProjectRole" AS ENUM ('ADMIN', 'DEVELOPER', 'VIEWER');
CREATE TYPE "EnvironmentKind" AS ENUM ('SANDBOX', 'PRODUCTION');
CREATE TYPE "ApiKeyScope" AS ENUM ('PAYMENTS_WRITE', 'CUSTOMERS_READ', 'RESOURCE_READ');

CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(280),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "restrict_production" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "environments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "kind" "EnvironmentKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_memberships" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'DEVELOPER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(280),
    "suspended_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_accounts_pkey" PRIMARY KEY ("id")
);

INSERT INTO "projects" ("id", "organization_id", "slug", "name", "is_default", "created_at", "updated_at")
SELECT gen_random_uuid()::text, "id", 'default', 'Default', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations";

INSERT INTO "environments" ("id", "project_id", "kind")
SELECT gen_random_uuid()::text, p."id", k."kind"
FROM "projects" p
CROSS JOIN (VALUES ('SANDBOX'::"EnvironmentKind"), ('PRODUCTION'::"EnvironmentKind")) AS k("kind");

CREATE TEMPORARY TABLE "_default_envs" AS
SELECT p."organization_id", p."id" AS "project_id", e."id" AS "environment_id", e."kind"
FROM "projects" p JOIN "environments" e ON e."project_id" = p."id"
WHERE p."is_default";

ALTER TABLE "agents" ADD COLUMN "project_id" TEXT, ADD COLUMN "environment_id" TEXT;
UPDATE "agents" a SET "project_id" = d."project_id", "environment_id" = d."environment_id"
FROM "_default_envs" d
WHERE d."organization_id" = a."organization_id"
  AND d."kind" = (CASE WHEN a."network" = 'BASE' THEN 'PRODUCTION' ELSE 'SANDBOX' END)::"EnvironmentKind";

ALTER TABLE "api_listings" ADD COLUMN "project_id" TEXT, ADD COLUMN "environment_id" TEXT;
UPDATE "api_listings" l SET "project_id" = d."project_id", "environment_id" = d."environment_id"
FROM "_default_envs" d
WHERE d."organization_id" = l."organization_id"
  AND d."kind" = (CASE WHEN l."network" = 'BASE' THEN 'PRODUCTION' ELSE 'SANDBOX' END)::"EnvironmentKind";
ALTER TABLE "api_listings" ALTER COLUMN "project_id" SET NOT NULL, ALTER COLUMN "environment_id" SET NOT NULL;

CREATE TEMPORARY TABLE "_org_kind" AS
SELECT o."id" AS "organization_id",
  (CASE WHEN EXISTS (SELECT 1 FROM "payments" p WHERE p."organization_id" = o."id" AND p."network" = 'BASE')
    THEN 'PRODUCTION' ELSE 'SANDBOX' END)::"EnvironmentKind" AS "kind"
FROM "organizations" o;

ALTER TABLE "api_keys"
  ADD COLUMN "project_id" TEXT,
  ADD COLUMN "environment_id" TEXT,
  ADD COLUMN "service_account_id" TEXT,
  ADD COLUMN "scopes" "ApiKeyScope"[] DEFAULT ARRAY[]::"ApiKeyScope"[];
UPDATE "api_keys" k SET "project_id" = l."project_id", "environment_id" = l."environment_id"
FROM "api_listings" l WHERE k."listing_id" = l."id";
UPDATE "api_keys" k SET "project_id" = a."project_id", "environment_id" = a."environment_id"
FROM "agents" a WHERE k."agent_id" = a."id" AND k."project_id" IS NULL;
UPDATE "api_keys" k SET "project_id" = d."project_id", "environment_id" = d."environment_id"
FROM "_org_kind" o JOIN "_default_envs" d ON d."organization_id" = o."organization_id" AND d."kind" = o."kind"
WHERE o."organization_id" = k."organization_id" AND k."project_id" IS NULL;
UPDATE "api_keys" SET "scopes" = ARRAY['PAYMENTS_WRITE', 'CUSTOMERS_READ', 'RESOURCE_READ']::"ApiKeyScope"[];
ALTER TABLE "api_keys" ALTER COLUMN "project_id" SET NOT NULL, ALTER COLUMN "environment_id" SET NOT NULL;

ALTER TABLE "webhooks" ADD COLUMN "project_id" TEXT, ADD COLUMN "environment_id" TEXT;
UPDATE "webhooks" h SET "project_id" = d."project_id", "environment_id" = d."environment_id"
FROM "_org_kind" o JOIN "_default_envs" d ON d."organization_id" = o."organization_id" AND d."kind" = o."kind"
WHERE o."organization_id" = h."organization_id";
ALTER TABLE "webhooks" ALTER COLUMN "project_id" SET NOT NULL, ALTER COLUMN "environment_id" SET NOT NULL;

ALTER TABLE "customers" ADD COLUMN "project_id" TEXT;
UPDATE "customers" c SET "project_id" = d."project_id"
FROM "_default_envs" d WHERE d."organization_id" = c."organization_id" AND d."kind" = 'SANDBOX';
ALTER TABLE "customers" ALTER COLUMN "project_id" SET NOT NULL;

ALTER TABLE "payments" ADD COLUMN "project_id" TEXT;
UPDATE "payments" p SET "project_id" = COALESCE(
  (SELECT l."project_id" FROM "api_listings" l WHERE l."id" = p."listing_id"),
  (SELECT a."project_id" FROM "agents" a WHERE a."id" = p."agent_id"),
  (SELECT d."project_id" FROM "_default_envs" d WHERE d."organization_id" = p."organization_id" AND d."kind" = 'SANDBOX')
);

ALTER TABLE "cli_sessions" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "cli_device_requests" ADD COLUMN "organization_id" TEXT;

DROP TABLE "_default_envs";
DROP TABLE "_org_kind";

CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");
CREATE UNIQUE INDEX "projects_organization_id_slug_key" ON "projects"("organization_id", "slug");
CREATE UNIQUE INDEX "environments_project_id_kind_key" ON "environments"("project_id", "kind");
CREATE INDEX "project_memberships_user_id_idx" ON "project_memberships"("user_id");
CREATE UNIQUE INDEX "project_memberships_project_id_user_id_key" ON "project_memberships"("project_id", "user_id");
CREATE INDEX "service_accounts_project_id_created_at_idx" ON "service_accounts"("project_id", "created_at" DESC);
CREATE INDEX "agents_project_id_environment_id_idx" ON "agents"("project_id", "environment_id");
CREATE INDEX "api_keys_project_id_environment_id_idx" ON "api_keys"("project_id", "environment_id");
CREATE INDEX "api_keys_service_account_id_idx" ON "api_keys"("service_account_id");
CREATE INDEX "api_listings_project_id_environment_id_idx" ON "api_listings"("project_id", "environment_id");
CREATE INDEX "cli_sessions_organization_id_idx" ON "cli_sessions"("organization_id");
CREATE INDEX "customers_project_id_created_at_idx" ON "customers"("project_id", "created_at" DESC);
CREATE INDEX "payments_project_id_created_at_idx" ON "payments"("project_id", "created_at" DESC);
CREATE INDEX "webhooks_project_id_environment_id_idx" ON "webhooks"("project_id", "environment_id");
CREATE UNIQUE INDEX "projects_one_default_per_organization_key"
    ON "projects" ("organization_id") WHERE "is_default";

ALTER TABLE "agents" ADD CONSTRAINT "agents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agents" ADD CONSTRAINT "agents_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_service_account_id_fkey" FOREIGN KEY ("service_account_id") REFERENCES "service_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_listings" ADD CONSTRAINT "api_listings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "api_listings" ADD CONSTRAINT "api_listings_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cli_sessions" ADD CONSTRAINT "cli_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
