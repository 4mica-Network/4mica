-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SETTLED', 'FAILED');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "listing_id" TEXT,
    "agent_id" TEXT,
    "payer_address" VARCHAR(42) NOT NULL,
    "recipient_address" VARCHAR(42) NOT NULL,
    "network" "PaymentNetwork" NOT NULL,
    "asset_address" VARCHAR(42),
    "amount" DECIMAL(38,18) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "failure_reason" VARCHAR(280),
    "req_id" VARCHAR(66) NOT NULL,
    "guarantee_claims" TEXT,
    "guarantee_signature" TEXT,
    "tx_hash" VARCHAR(66),
    "resource" VARCHAR(2048),
    "description" VARCHAR(280),
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_owner_id_created_at_idx" ON "payments"("owner_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_payer_address_created_at_idx" ON "payments"("payer_address", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_recipient_address_created_at_idx" ON "payments"("recipient_address", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payments_owner_id_req_id_key" ON "payments"("owner_id", "req_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "api_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_address_lowercase"
    CHECK ("payer_address" ~ '^0x[0-9a-f]{40}$');

ALTER TABLE "payments" ADD CONSTRAINT "payments_recipient_address_lowercase"
    CHECK ("recipient_address" ~ '^0x[0-9a-f]{40}$');

ALTER TABLE "payments" ADD CONSTRAINT "payments_asset_address_lowercase"
    CHECK ("asset_address" IS NULL OR "asset_address" ~ '^0x[0-9a-f]{40}$');

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_non_negative"
    CHECK ("amount" >= 0);
