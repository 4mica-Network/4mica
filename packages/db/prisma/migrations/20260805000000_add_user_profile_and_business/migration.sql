-- CreateEnum
CREATE TYPE "KybStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('SOLE_TRADER', 'PARTNERSHIP', 'LLC', 'CORPORATION', 'NON_PROFIT');

-- CreateEnum
CREATE TYPE "NotificationPlacement" AS ENUM ('topLeft', 'topRight', 'bottomLeft', 'bottomRight');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "allow_changelog_newsletter_emails" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_custom_brand_color" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allow_dpa_emails" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_email_visibility" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_invite_accepted_emails" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_marketing_onboarding_emails" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_monthly_emails" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_notification" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_phone_number_visibility" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_privacy_legal_emails" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_seo_indexing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allow_sms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "app_theme" TEXT NOT NULL DEFAULT 'dark',
ADD COLUMN     "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "complete_onboarding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "default_home" TEXT NOT NULL DEFAULT 'overview',
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "disable_branding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_seeded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "last_login" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "last_viewed" TEXT,
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notification_placement" "NotificationPlacement" NOT NULL DEFAULT 'bottomRight',
ADD COLUMN     "phone_number" VARCHAR(20),
ADD COLUMN     "phone_number_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "primary_brand_color" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "privacy_mode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "private" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "secondary_brand_color" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'dark',
ADD COLUMN     "time_zone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN     "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "usage_time" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "username" VARCHAR(64),
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "email" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "name" SET DEFAULT '';

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "legal_name" VARCHAR(255) NOT NULL DEFAULT '',
    "trading_name" VARCHAR(255),
    "business_type" "BusinessType",
    "registration_number" VARCHAR(64),
    "tax_id" VARCHAR(64),
    "vat_number" VARCHAR(64),
    "industry" VARCHAR(128),
    "website" VARCHAR(255),
    "description" TEXT,
    "support_email" VARCHAR(255),
    "support_phone" VARCHAR(20),
    "address_line1" VARCHAR(255),
    "address_line2" VARCHAR(255),
    "city" VARCHAR(128),
    "region" VARCHAR(128),
    "postal_code" VARCHAR(32),
    "country" VARCHAR(2),
    "statement_descriptor" VARCHAR(22),
    "payout_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "kyb_status" "KybStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "kyb_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_owner_id_key" ON "businesses"("owner_id");

-- CreateIndex
CREATE INDEX "businesses_kyb_status_idx" ON "businesses"("kyb_status");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
