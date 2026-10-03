-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('HUMAN', 'ORGANIZATION', 'AGENT', 'WALLET');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CustomerIdentityType" AS ENUM ('WALLET', 'EMAIL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "CustomerIdentitySource" AS ENUM ('MANUAL', 'API', 'VERIFIED', 'DISCOVERED');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320),
    "type" "CustomerType" NOT NULL DEFAULT 'ORGANIZATION',
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" VARCHAR(280),
    "notes" VARCHAR(2000),
    "daily_limit" DECIMAL(38,18),
    "monthly_limit" DECIMAL(38,18),
    "limit_currency" VARCHAR(16) NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payment_identities" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "type" "CustomerIdentityType" NOT NULL,
    "network" "PaymentNetwork",
    "address" VARCHAR(42),
    "value" VARCHAR(320),
    "source" "CustomerIdentitySource" NOT NULL DEFAULT 'MANUAL',
    "verified_at" TIMESTAMP(3),
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_payment_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_owner_id_created_at_idx" ON "customers"("owner_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "customers_owner_id_status_idx" ON "customers"("owner_id", "status");

-- CreateIndex
CREATE INDEX "customer_payment_identities_customer_id_idx" ON "customer_payment_identities"("customer_id");

-- CreateIndex
CREATE INDEX "customer_payment_identities_address_network_idx" ON "customer_payment_identities"("address", "network");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payment_identities_owner_id_network_address_key" ON "customer_payment_identities"("owner_id", "network", "address");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payment_identities_owner_id_type_value_key" ON "customer_payment_identities"("owner_id", "type", "value");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment_identities" ADD CONSTRAINT "customer_payment_identities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment_identities" ADD CONSTRAINT "customer_payment_identities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "customer_payment_identities"
    ADD CONSTRAINT "customer_payment_identities_address_lowercase"
    CHECK ("address" IS NULL OR "address" ~ '^0x[0-9a-f]{40}$');

ALTER TABLE "customer_payment_identities"
    ADD CONSTRAINT "customer_payment_identities_shape"
    CHECK (
      ("type" = 'WALLET'
        AND "address" IS NOT NULL
        AND "network" IS NOT NULL
        AND "value" IS NULL)
      OR ("type" <> 'WALLET'
        AND "value" IS NOT NULL
        AND "address" IS NULL
        AND "network" IS NULL)
    );

ALTER TABLE "customer_payment_identities"
    ADD CONSTRAINT "customer_payment_identities_validity_window"
    CHECK ("valid_from" IS NULL OR "valid_until" IS NULL OR "valid_from" < "valid_until");

ALTER TABLE "customers" ADD CONSTRAINT "customers_daily_limit_non_negative"
    CHECK ("daily_limit" IS NULL OR "daily_limit" >= 0);

ALTER TABLE "customers" ADD CONSTRAINT "customers_monthly_limit_non_negative"
    CHECK ("monthly_limit" IS NULL OR "monthly_limit" >= 0);
