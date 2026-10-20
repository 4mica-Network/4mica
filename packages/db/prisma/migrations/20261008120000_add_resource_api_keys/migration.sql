-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "agent_id" TEXT,
ADD COLUMN     "listing_id" TEXT;

-- CreateIndex
CREATE INDEX "api_keys_listing_id_idx" ON "api_keys"("listing_id");

-- CreateIndex
CREATE INDEX "api_keys_agent_id_idx" ON "api_keys"("agent_id");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "api_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
