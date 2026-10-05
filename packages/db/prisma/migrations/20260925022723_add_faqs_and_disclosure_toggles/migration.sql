-- AlterTable
ALTER TABLE "resource_policies" ADD COLUMN     "faq_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "policy_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "faq_items" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT,
    "agent_id" TEXT,
    "question" VARCHAR(280) NOT NULL,
    "answer" VARCHAR(2000) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faq_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "faq_items_listing_id_sort_order_idx" ON "faq_items"("listing_id", "sort_order");

-- CreateIndex
CREATE INDEX "faq_items_agent_id_sort_order_idx" ON "faq_items"("agent_id", "sort_order");

-- AddForeignKey
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "api_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_one_target"
    CHECK (("listing_id" IS NULL) <> ("agent_id" IS NULL));
