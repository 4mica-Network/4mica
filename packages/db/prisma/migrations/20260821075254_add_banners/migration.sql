-- CreateEnum
CREATE TYPE "BannerInteractionType" AS ENUM ('VIEWED', 'CLICKED', 'DISMISSED', 'VIDEO_PLAYED');

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "title" VARCHAR(120),
    "message" VARCHAR(280),
    "url" VARCHAR(2048),
    "thumbnail_url" VARCHAR(2048),
    "video_url" VARCHAR(2048),
    "alt" VARCHAR(160),
    "is_video" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banner_interactions" (
    "id" TEXT NOT NULL,
    "banner_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "BannerInteractionType" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banner_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banners_slug_key" ON "banners"("slug");

-- CreateIndex
CREATE INDEX "banners_active_starts_at_ends_at_idx" ON "banners"("active", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "banner_interactions_banner_id_type_idx" ON "banner_interactions"("banner_id", "type");

-- CreateIndex
CREATE INDEX "banner_interactions_user_id_idx" ON "banner_interactions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "banner_interactions_banner_id_user_id_type_key" ON "banner_interactions"("banner_id", "user_id", "type");

-- AddForeignKey
ALTER TABLE "banner_interactions" ADD CONSTRAINT "banner_interactions_banner_id_fkey" FOREIGN KEY ("banner_id") REFERENCES "banners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banner_interactions" ADD CONSTRAINT "banner_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
