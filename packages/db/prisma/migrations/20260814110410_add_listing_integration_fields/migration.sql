-- CreateEnum
CREATE TYPE "PaymentNetwork" AS ENUM ('BASE', 'BASE_SEPOLIA', 'ETHEREUM_SEPOLIA');

-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "network" "PaymentNetwork" NOT NULL DEFAULT 'ETHEREUM_SEPOLIA';

-- AlterTable
ALTER TABLE "api_listings" ADD COLUMN     "asset_address" VARCHAR(42),
ADD COLUMN     "network" "PaymentNetwork",
ADD COLUMN     "pay_to_address" VARCHAR(42),
ADD COLUMN     "price_amount" DECIMAL(38,18),
ADD COLUMN     "price_currency" VARCHAR(16),
ADD COLUMN     "x402_endpoint" VARCHAR(2048);

-- CreateTable
CREATE TABLE "api_endpoints" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "method" "HttpMethod" NOT NULL DEFAULT 'GET',
    "path" VARCHAR(512) NOT NULL,
    "summary" VARCHAR(280),
    "price_amount" DECIMAL(38,18),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_endpoints_listing_id_idx" ON "api_endpoints"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_endpoints_listing_id_method_path_key" ON "api_endpoints"("listing_id", "method", "path");

-- AddForeignKey
ALTER TABLE "api_endpoints" ADD CONSTRAINT "api_endpoints_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "api_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
