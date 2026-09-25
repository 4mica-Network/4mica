-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SCAM', 'NOT_WORKING', 'MISLEADING_PRICING', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT,
    "agent_id" TEXT,
    "author_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(120),
    "body" VARCHAR(2000),
    "verified_purchase" BOOLEAN NOT NULL DEFAULT false,
    "owner_reply" VARCHAR(2000),
    "owner_replied_at" TIMESTAMP(3),
    "hidden_at" TIMESTAMP(3),
    "hidden_reason" VARCHAR(280),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT,
    "agent_id" TEXT,
    "reporter_id" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "detail" VARCHAR(2000),
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolution_note" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_policies" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT,
    "agent_id" TEXT,
    "refund_policy" VARCHAR(2000),
    "uptime_target" VARCHAR(120),
    "support_response" VARCHAR(120),
    "support_email" VARCHAR(320),
    "rate_limit" VARCHAR(120),
    "data_retention" VARCHAR(2000),
    "test_endpoint" VARCHAR(2048),
    "terms_url" VARCHAR(2048),
    "privacy_url" VARCHAR(2048),
    "status_url" VARCHAR(2048),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_listing_id_created_at_idx" ON "reviews"("listing_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reviews_agent_id_created_at_idx" ON "reviews"("agent_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_listing_id_author_id_key" ON "reviews"("listing_id", "author_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_agent_id_author_id_key" ON "reviews"("agent_id", "author_id");

-- CreateIndex
CREATE INDEX "reports_listing_id_created_at_idx" ON "reports"("listing_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reports_agent_id_created_at_idx" ON "reports"("agent_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "resource_policies_listing_id_key" ON "resource_policies"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_policies_agent_id_key" ON "resource_policies"("agent_id");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "api_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "api_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_policies" ADD CONSTRAINT "resource_policies_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "api_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_policies" ADD CONSTRAINT "resource_policies_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range"
    CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_one_target"
    CHECK (("listing_id" IS NULL) <> ("agent_id" IS NULL));

ALTER TABLE "reports" ADD CONSTRAINT "reports_one_target"
    CHECK (("listing_id" IS NULL) <> ("agent_id" IS NULL));

ALTER TABLE "resource_policies" ADD CONSTRAINT "resource_policies_one_target"
    CHECK (("listing_id" IS NULL) <> ("agent_id" IS NULL));
