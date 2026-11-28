import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inLegacySchema } from "@/test-support/legacy-schema";

const url = process.env.INTEGRATION_DATABASE_URL;

const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const PAYER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";
const MIGRATION = "20261202121000_preserve_spend_authorized_amount";

type Db = typeof import("@4mica/db");

describe.skipIf(!url)("authorized and settled amounts on real Postgres", () => {
  let db: Db["prisma"];

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = (await import("@4mica/db")).prisma;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("backfills only provable amounts and freezes them afterwards", async () => {
    await inLegacySchema(db, MIGRATION, async (tx, migrate) => {
      await tx.$executeRawUnsafe(`
        INSERT INTO organizations (id, name, updated_at) VALUES ('org', 'legacy', now());
        INSERT INTO projects (id, organization_id, slug, name, updated_at)
             VALUES ('project', 'org', 'default', 'Default', now());
        INSERT INTO approval_requests
               (id, organization_id, kind, action, summary, payload, payload_hash, expires_at, updated_at)
        VALUES ('approval-cut', 'org', 'PAYMENT', 'payment.authorize', 's',
                '{"authorizationId": "cut-approved", "amount": "9.5"}', 'h', now(), now()),
               ('approval-other', 'org', 'PAYMENT', 'payment.authorize', 's',
                '{"authorizationId": "someone-else", "amount": "50"}', 'h', now(), now());
        INSERT INTO payments
               (id, organization_id, payer_address, recipient_address, network,
                asset_address, amount, req_id, status, updated_at)
        VALUES ('p-cut-approved', 'org', '${PAYER}', '${RECIPIENT}', 'BASE_SEPOLIA', '${USDC}', 4, 'r1', 'SETTLED', now()),
               ('p-cut-plain', 'org', '${PAYER}', '${RECIPIENT}', 'BASE_SEPOLIA', '${USDC}', 4, 'r2', 'SETTLED', now()),
               ('p-consume-linked', 'org', '${PAYER}', '${RECIPIENT}', 'BASE_SEPOLIA', '${USDC}', 3, 'r3', 'SETTLED', now()),
               ('p-other-approval', 'org', '${PAYER}', '${RECIPIENT}', 'BASE_SEPOLIA', '${USDC}', 5, 'r4', 'SETTLED', now());
      `);
      const row = (
        id: string,
        status: string,
        amount: string,
        payment: string | null = null,
        approval: string | null = null,
      ) => `('${id}', 'org', 'project', 'SANDBOX', 'BASE_SEPOLIA', '${USDC}',
        '${PAYER}', '${RECIPIENT}', ${amount}, '${status}',
        ${payment ? `'${payment}'` : "NULL"}, ${approval ? `'${approval}'` : "NULL"},
        now(), now())`;
      await tx.$executeRawUnsafe(`
        INSERT INTO spend_authorizations
               (id, organization_id, project_id, environment, network, asset_address,
                payer_address, recipient_address, amount, status, payment_id,
                approval_request_id, expires_at, updated_at)
        VALUES ${[
          row("reserved", "RESERVED", "10"),
          row("consumed-unlinked", "CONSUMED", "12"),
          row("denied", "DENIED", "7"),
          row(
            "cut-approved",
            "CONSUMED",
            "4",
            "p-cut-approved",
            "approval-cut",
          ),
          row("cut-plain", "CONSUMED", "4", "p-cut-plain"),
          row("consume-linked", "CONSUMED", "10", "p-consume-linked"),
          row(
            "cut-other-approval",
            "CONSUMED",
            "5",
            "p-other-approval",
            "approval-other",
          ),
        ].join(",")}
      `);

      await migrate();

      const rows = await tx.$queryRawUnsafe<
        {
          id: string;
          amount: string;
          authorized: string | null;
          settled: string | null;
        }[]
      >(
        "SELECT id, amount::text AS amount, authorized_amount::float8::text AS authorized, settled_amount::float8::text AS settled FROM spend_authorizations ORDER BY id",
      );
      expect(
        Object.fromEntries(
          rows.map((entry) => [entry.id, [entry.authorized, entry.settled]]),
        ),
      ).toEqual({
        "consume-linked": ["10", null],
        "consumed-unlinked": ["12", null],
        "cut-approved": ["9.5", "4"],
        "cut-other-approval": [null, "5"],
        "cut-plain": [null, "4"],
        denied: ["7", null],
        reserved: ["10", null],
      });

      await expect(
        tx.$executeRawUnsafe(
          "UPDATE spend_authorizations SET settled_amount = 3 WHERE id = 'consume-linked'",
        ),
      ).resolves.toBe(1);
      await tx.$executeRawUnsafe("SAVEPOINT frozen");
      await expect(
        tx.$executeRawUnsafe(
          "UPDATE spend_authorizations SET authorized_amount = 11 WHERE id = 'reserved'",
        ),
      ).rejects.toThrow(/authorized_amount is immutable/);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT frozen");
      await expect(
        tx.$executeRawUnsafe(
          "UPDATE spend_authorizations SET settled_amount = 2 WHERE id = 'cut-plain'",
        ),
      ).rejects.toThrow(/settled_amount is immutable/);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT frozen");
      await expect(
        tx.$executeRawUnsafe(
          "UPDATE spend_authorizations SET amount = 1, status = 'RELEASED' WHERE id = 'reserved'",
        ),
      ).resolves.toBe(1);
    });
  }, 300_000);
});
