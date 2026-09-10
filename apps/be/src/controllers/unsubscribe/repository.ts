import { prisma } from "@4mica/db";

/**
 * Opt a user out of the onboarding drip.
 *
 * The queue row is deliberately **not** moved to `PAUSED`: the tick's claim
 * query joins `user` and filters on `allowMarketingOnboardingEmails`, so an
 * opted-out user is simply never claimed. That also means flipping the
 * dashboard toggle back on resumes the sequence with no extra code path.
 *
 * Any lock the row is holding is released so a re-subscribe is due immediately
 * rather than waiting out a stale lock.
 */
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
