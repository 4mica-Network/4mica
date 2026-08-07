import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

const createPrismaClient = (): PrismaClient => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Load it (dotenv) before importing @4mica/db.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
};

const globalForPrisma = globalThis as typeof globalThis & {
  __4micaPrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__4micaPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__4micaPrisma = prisma;
}

export const disconnect = async (): Promise<void> => {
  await prisma.$disconnect();
  globalForPrisma.__4micaPrisma = undefined;
};
