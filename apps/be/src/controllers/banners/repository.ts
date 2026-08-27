import { prisma } from "@4mica/db";
import type { RecordBannerInteractionInput } from "./schema";

const MAX_BANNERS = 5;

const BANNER_SELECT = {
  id: true,
  title: true,
  message: true,
  url: true,
  thumbnailUrl: true,
  videoUrl: true,
  alt: true,
  isVideo: true,
} as const;

export const listActiveBanners = (userId: string) => {
  const now = new Date();

  return prisma.banner.findMany({
    where: {
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
      interactions: { none: { userId, type: "DISMISSED" } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: MAX_BANNERS,
    select: BANNER_SELECT,
  });
};

export const recordInteraction = async (
  userId: string,
  bannerId: string,
  { type }: RecordBannerInteractionInput,
) => {
  const banner = await prisma.banner.findUnique({
    where: { id: bannerId },
    select: { id: true },
  });

  if (!banner) {
    return null;
  }

  return prisma.bannerInteraction.upsert({
    where: { bannerId_userId_type: { bannerId, userId, type } },
    create: { bannerId, userId, type },
    update: { count: { increment: 1 } },
    select: { id: true, type: true, count: true },
  });
};
