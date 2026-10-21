-- CreateEnum
CREATE TYPE "MonthlyVolume" AS ENUM ('UNDER_10K', 'FROM_10K_TO_100K', 'FROM_100K_TO_1M', 'OVER_1M');

-- CreateEnum
CREATE TYPE "CustomerBase" AS ENUM ('BUSINESSES', 'CONSUMERS', 'BOTH');

-- CreateEnum
CREATE TYPE "FundsSource" AS ENUM ('BUSINESS_REVENUE', 'INVESTMENT', 'LOANS', 'PERSONAL_SAVINGS', 'OTHER');

-- CreateEnum
CREATE TYPE "OwnerRole" AS ENUM ('OWNER', 'DIRECTOR', 'CONTROLLER', 'SIGNATORY');

-- CreateTable
CREATE TABLE "compliance_profiles" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "incorporation_country" VARCHAR(2),
    "incorporated_on" DATE,
    "monthly_volume" "MonthlyVolume",
    "customer_base" "CustomerBase",
    "customer_regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_regulated" BOOLEAN NOT NULL DEFAULT false,
    "licence_type" VARCHAR(128),
    "licence_number" VARCHAR(64),
    "regulator" VARCHAR(128),
    "has_aml_policy" BOOLEAN NOT NULL DEFAULT false,
    "compliance_officer_name" VARCHAR(120),
    "compliance_officer_email" VARCHAR(255),
    "terms_url" VARCHAR(255),
    "privacy_url" VARCHAR(255),
    "refund_policy_url" VARCHAR(255),
    "funds_source" "FundsSource",
    "funds_source_detail" TEXT,
    "sanctions_attested_at" TIMESTAMP(3),
    "prohibited_attested_at" TIMESTAMP(3),
    "accuracy_attested_at" TIMESTAMP(3),
    "attested_by" VARCHAR(120),
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficial_owners" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "role" "OwnerRole" NOT NULL,
    "ownership_percent" INTEGER,
    "date_of_birth" DATE NOT NULL,
    "nationality" VARCHAR(2) NOT NULL,
    "country_of_residence" VARCHAR(2) NOT NULL,
    "email" VARCHAR(255),
    "is_pep" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beneficial_owners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compliance_profiles_owner_id_key" ON "compliance_profiles"("owner_id");

-- CreateIndex
CREATE INDEX "beneficial_owners_owner_id_idx" ON "beneficial_owners"("owner_id");

-- AddForeignKey
ALTER TABLE "compliance_profiles" ADD CONSTRAINT "compliance_profiles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficial_owners" ADD CONSTRAINT "beneficial_owners_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

