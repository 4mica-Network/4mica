-- CreateEnum
CREATE TYPE "WalletRole" AS ENUM ('PAYER', 'RECIPIENT', 'BOTH');

-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'PAUSED', 'RETIRED');

-- CreateEnum
CREATE TYPE "WalletVerificationMethod" AS ENUM ('EOA_SIGNATURE', 'ERC1271');

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "description" VARCHAR(280),
    "address" VARCHAR(42) NOT NULL,
    "network" "PaymentNetwork" NOT NULL,
    "role" "WalletRole" NOT NULL DEFAULT 'BOTH',
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3) NOT NULL,
    "verification_method" "WalletVerificationMethod" NOT NULL DEFAULT 'EOA_SIGNATURE',
    "verified_chain_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_nonces" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "network" "PaymentNetwork" NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "uri" VARCHAR(2048) NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_nonces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallets_owner_id_created_at_idx" ON "wallets"("owner_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "wallets_address_network_idx" ON "wallets"("address", "network");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_owner_id_address_network_key" ON "wallets"("owner_id", "address", "network");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_nonces_nonce_key" ON "wallet_nonces"("nonce");

-- CreateIndex
CREATE INDEX "wallet_nonces_user_id_idx" ON "wallet_nonces"("user_id");

-- CreateIndex
CREATE INDEX "wallet_nonces_expires_at_idx" ON "wallet_nonces"("expires_at");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_nonces" ADD CONSTRAINT "wallet_nonces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_address_lowercase"
    CHECK ("address" ~ '^0x[0-9a-f]{40}$');

ALTER TABLE "wallet_nonces" ADD CONSTRAINT "wallet_nonces_address_lowercase"
    CHECK ("address" ~ '^0x[0-9a-f]{40}$');

CREATE UNIQUE INDEX "wallets_owner_network_default_key"
    ON "wallets" ("owner_id", "network") WHERE "is_default";
