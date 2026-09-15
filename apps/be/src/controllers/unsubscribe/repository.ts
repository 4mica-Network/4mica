import { prisma } from "@4mica/db";

export const unsubscribeFromOnboarding = async (
  userId: string,
): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    return false;
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { allowMarketingOnboardingEmails: false },
    }),
    prisma.onboardingEmailQueue.updateMany({
      where: { userId },
      data: { lockId: null, lockedUntil: null },
    }),
  ]);

  return true;
};
