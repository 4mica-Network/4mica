import { prisma } from "@4mica/db";

export const pingDatabase = async (): Promise<void> => {
  await prisma.$queryRaw`SELECT 1`;
};
