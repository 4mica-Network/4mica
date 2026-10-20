-- CreateEnum
CREATE TYPE "CustomerQuotaUnit" AS ENUM ('REQUESTS', 'AMOUNT');

-- CreateEnum
CREATE TYPE "CustomerQuotaPeriod" AS ENUM ('DAY', 'WEEK', 'MONTH', 'TOTAL');

-- CreateEnum
CREATE TYPE "CustomerCouponKind" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "CustomerCreditKind" AS ENUM ('PROMOTIONAL', 'PREPAID', 'ADJUSTMENT');

-- AlterEnum
ALTER TYPE "CustomerStatus" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "customer_payment_identities" ADD COLUMN     "blocked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "approval_threshold" DECIMAL(38,18),
ADD COLUMN     "discount_fixed" DECIMAL(38,18),
ADD COLUMN     "discount_percent" DECIMAL(5,2),
ADD COLUMN     "free_quota" DECIMAL(38,18),
ADD COLUMN     "free_quota_period" "CustomerQuotaPeriod",
ADD COLUMN     "free_quota_unit" "CustomerQuotaUnit",
ADD COLUMN     "min_payment_amount" DECIMAL(38,18),
ADD COLUMN     "quota_reset_at" TIMESTAMP(3),
ADD COLUMN     "status_reason" VARCHAR(280),
ADD COLUMN     "suspended_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "customer_coupons" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "kind" "CustomerCouponKind" NOT NULL,
    "value" DECIMAL(38,18) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "usage_limit" INTEGER,
    "times_redeemed" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_credit_entries" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "kind" "CustomerCreditKind" NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "reason" VARCHAR(280),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_credit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_coupons_customer_id_created_at_idx" ON "customer_coupons"("customer_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "customer_coupons_owner_id_code_key" ON "customer_coupons"("owner_id", "code");

-- CreateIndex
CREATE INDEX "customer_credit_entries_customer_id_created_at_idx" ON "customer_credit_entries"("customer_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "customer_coupons" ADD CONSTRAINT "customer_coupons_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_coupons" ADD CONSTRAINT "customer_coupons_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_entries" ADD CONSTRAINT "customer_credit_entries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_entries" ADD CONSTRAINT "customer_credit_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "customers" ADD CONSTRAINT "customers_free_quota_shape"
    CHECK (
      ("free_quota_unit" IS NULL AND "free_quota" IS NULL AND "free_quota_period" IS NULL)
      OR ("free_quota_unit" IS NOT NULL AND "free_quota" IS NOT NULL AND "free_quota_period" IS NOT NULL)
    );

ALTER TABLE "customers" ADD CONSTRAINT "customers_free_quota_requests_whole"
    CHECK ("free_quota_unit" <> 'REQUESTS' OR "free_quota" = trunc("free_quota"));

ALTER TABLE "customers" ADD CONSTRAINT "customers_free_quota_non_negative"
    CHECK ("free_quota" IS NULL OR "free_quota" >= 0);

ALTER TABLE "customers" ADD CONSTRAINT "customers_discount_percent_range"
    CHECK ("discount_percent" IS NULL OR ("discount_percent" >= 0 AND "discount_percent" <= 100));

ALTER TABLE "customers" ADD CONSTRAINT "customers_discount_fixed_non_negative"
    CHECK ("discount_fixed" IS NULL OR "discount_fixed" >= 0);

ALTER TABLE "customers" ADD CONSTRAINT "customers_min_payment_non_negative"
    CHECK ("min_payment_amount" IS NULL OR "min_payment_amount" >= 0);

ALTER TABLE "customers" ADD CONSTRAINT "customers_approval_threshold_non_negative"
    CHECK ("approval_threshold" IS NULL OR "approval_threshold" >= 0);

ALTER TABLE "customers" ADD CONSTRAINT "customers_suspended_until_requires_status"
    CHECK ("suspended_until" IS NULL OR "status" = 'SUSPENDED');

ALTER TABLE "customer_coupons" ADD CONSTRAINT "customer_coupons_value_non_negative"
    CHECK ("value" >= 0);

ALTER TABLE "customer_coupons" ADD CONSTRAINT "customer_coupons_percent_range"
    CHECK ("kind" <> 'PERCENT' OR "value" <= 100);

ALTER TABLE "customer_coupons" ADD CONSTRAINT "customer_coupons_usage_limit_positive"
    CHECK ("usage_limit" IS NULL OR "usage_limit" > 0);

ALTER TABLE "customer_coupons" ADD CONSTRAINT "customer_coupons_times_redeemed_non_negative"
    CHECK ("times_redeemed" >= 0);

ALTER TABLE "customer_credit_entries" ADD CONSTRAINT "customer_credit_entries_amount_non_zero"
    CHECK ("amount" <> 0);
