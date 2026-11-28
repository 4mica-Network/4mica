import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma, PrismaClient } from "@4mica/db";

const MIGRATIONS = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "packages",
  "db",
  "prisma",
  "migrations",
);

const migrationNames = (): string[] =>
  readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const applyMigrations = async (
  tx: Prisma.TransactionClient,
  names: string[],
): Promise<void> => {
  for (const name of names) {
    await tx.$executeRawUnsafe(
      readFileSync(join(MIGRATIONS, name, "migration.sql"), "utf8"),
    );
  }
};

class Rollback extends Error {}

export const inLegacySchema = async (
  db: PrismaClient,
  migration: string,
  work: (
    tx: Prisma.TransactionClient,
    migrate: () => Promise<void>,
  ) => Promise<void>,
): Promise<void> => {
  const names = migrationNames();
  const target = names.indexOf(migration);
  if (target < 0) {
    throw new Error(`Unknown migration ${migration}`);
  }
  const schema = `legacy_${randomUUID().replaceAll("-", "")}`;
  await db
    .$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}"`,
        );
        await applyMigrations(tx, names.slice(0, target));
        await work(tx, () => applyMigrations(tx, [migration]));
        throw new Rollback();
      },
      { timeout: 300_000, maxWait: 60_000 },
    )
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) {
        throw error;
      }
    });
};
