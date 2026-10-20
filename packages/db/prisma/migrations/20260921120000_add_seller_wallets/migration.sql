-- DropIndex
DROP INDEX "agents_wallet_address_key";

-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "asset_address" VARCHAR(42),
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "docs_url" VARCHAR(2048),
ADD COLUMN     "endpoint_url" VARCHAR(2048),
ADD COLUMN     "pay_to_address" VARCHAR(42),
ADD COLUMN     "payer_wallet_id" TEXT,
ADD COLUMN     "price_amount" DECIMAL(38,18),
ADD COLUMN     "price_currency" VARCHAR(16),
ADD COLUMN     "price_label" VARCHAR(64),
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "wallet_id" TEXT,
ADD COLUMN     "x402_endpoint" VARCHAR(2048),
ALTER COLUMN "wallet_address" DROP NOT NULL,
ALTER COLUMN "wallet_address" SET DATA TYPE VARCHAR(42);

-- AlterTable
ALTER TABLE "api_listings" ADD COLUMN     "wallet_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "agents_wallet_address_network_key" ON "agents"("wallet_address", "network");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_payer_wallet_id_fkey" FOREIGN KEY ("payer_wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_listings" ADD CONSTRAINT "api_listings_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "api_listings" SET "asset_address" = lower("asset_address")
    WHERE "asset_address" IS NOT NULL;
UPDATE "api_listings" SET "pay_to_address" = lower("pay_to_address")
    WHERE "pay_to_address" IS NOT NULL;
UPDATE "agents" SET "wallet_address" = lower("wallet_address")
    WHERE "wallet_address" IS NOT NULL;

ALTER TABLE "agents" ADD CONSTRAINT "agents_wallet_address_lowercase"
    CHECK ("wallet_address" IS NULL OR "wallet_address" ~ '^0x[0-9a-f]{40}$');

ALTER TABLE "agents" ADD CONSTRAINT "agents_pay_to_address_lowercase"
    CHECK ("pay_to_address" IS NULL OR "pay_to_address" ~ '^0x[0-9a-f]{40}$');

ALTER TABLE "agents" ADD CONSTRAINT "agents_asset_address_lowercase"
    CHECK ("asset_address" IS NULL OR "asset_address" ~ '^0x[0-9a-f]{40}$');

ALTER TABLE "api_listings" ADD CONSTRAINT "api_listings_pay_to_address_lowercase"
    CHECK ("pay_to_address" IS NULL OR "pay_to_address" ~ '^0x[0-9a-f]{40}$');

ALTER TABLE "api_listings" ADD CONSTRAINT "api_listings_asset_address_lowercase"
    CHECK ("asset_address" IS NULL OR "asset_address" ~ '^0x[0-9a-f]{40}$');
