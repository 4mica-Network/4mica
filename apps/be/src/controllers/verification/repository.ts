import { prisma } from "@4mica/db";
import { generateEmailVerificationToken, hashSecret } from "@services/secrets";

export const EMAIL_VERIFICATION_TTL_HOURS = 24;

const TTL_MS = EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000;

export type VerificationResult = "success" | "expired" | "invalid";

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

export const consumeEmailVerification = async (
  token: string,
): Promise<VerificationResult> => {
  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashSecret(token) },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      consumedAt: true,
      user: { select: { id: true, email: true } },
    },
  });

  if (!row || row.consumedAt !== null) {
    return "invalid";
  }

  if (row.user.email !== row.email) {
    return "invalid";
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    return "expired";
  }

  await prisma.$transaction([
    prisma.emailVerificationToken.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: row.user.id },
      data: { emailVerified: true },
    }),
  ]);

  return "success";
};
