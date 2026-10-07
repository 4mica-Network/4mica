import { prisma } from "@4mica/db";
import { isUniqueViolation } from "@services/prisma-errors";
import { generateEmailVerificationToken, hashSecret } from "@services/secrets";

export const EMAIL_VERIFICATION_TTL_HOURS = 24;

const TTL_MS = EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000;

export type VerificationResult = "success" | "expired" | "invalid" | "taken";

export const createEmailVerification = async (
  userId: string,
  email: string,
): Promise<string> => {
  const secret = generateEmailVerificationToken();

  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({
      where: { userId, consumedAt: null },
    }),
    prisma.emailVerificationToken.create({
      data: {
        userId,
        email,
        tokenHash: secret.hash,
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    }),
  ]);

  return secret.plaintext;
};

/**
 * Spends a link on behalf of the signed-in `userId`. A token minted for anyone
 * else reads as invalid, so a link that reaches the wrong inbox — or a scanner
 * that prefetches it — can never verify an address for another account.
 *
 * A token for the pending address promotes it to `email`; a token for the
 * current, unverified address just marks it verified. Anything else is stale.
 */
export const consumeEmailVerification = async (
  token: string,
  userId: string,
): Promise<VerificationResult> => {
  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashSecret(token) },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      consumedAt: true,
      user: { select: { id: true, email: true, pendingEmail: true } },
    },
  });

  if (!row || row.consumedAt !== null || row.user.id !== userId) {
    return "invalid";
  }

  const promotes = row.user.pendingEmail === row.email;
  if (!promotes && row.user.email !== row.email) {
    return "invalid";
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    return "expired";
  }

  try {
    await prisma.$transaction([
      prisma.emailVerificationToken.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: row.user.id },
        data: promotes
          ? { email: row.email, pendingEmail: null, emailVerified: true }
          : { emailVerified: true },
      }),
    ]);
  } catch (error) {
    // Another account already holds the address. Proving you can read an
    // inbox does not evict a verified owner, so the change is refused.
    if (isUniqueViolation(error)) {
      return "taken";
    }
    throw error;
  }

  return "success";
};
