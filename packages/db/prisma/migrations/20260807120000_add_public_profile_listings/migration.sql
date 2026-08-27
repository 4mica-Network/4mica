-- CreateEnum
CREATE TYPE "PublicVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "headline" VARCHAR(160),
ADD COLUMN     "owner_id" TEXT,
ADD COLUMN     "slug" VARCHAR(64),
ADD COLUMN     "visibility" "PublicVisibility" NOT NULL DEFAULT 'PRIVATE';

-- CreateTable
CREATE TABLE "api_listings" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "summary" VARCHAR(280),
    "description" TEXT,
    "base_url" VARCHAR(2048),
    "docs_url" VARCHAR(2048),
    "category" VARCHAR(64),
    "tags" TEXT[],
    "price_label" VARCHAR(64),
    "visibility" "PublicVisibility" NOT NULL DEFAULT 'PRIVATE',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "api_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_listings_owner_id_visibility_idx" ON "api_listings"("owner_id", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "api_listings_owner_id_slug_key" ON "api_listings"("owner_id", "slug");

-- CreateIndex
CREATE INDEX "agents_owner_id_visibility_idx" ON "agents"("owner_id", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "agents_owner_id_slug_key" ON "agents"("owner_id", "slug");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_listings" ADD CONSTRAINT "api_listings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

