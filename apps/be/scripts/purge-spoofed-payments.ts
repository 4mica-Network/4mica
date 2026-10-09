/**
 * Finds payment rows whose recipient is not a wallet the reporting account
 * holds — rows POST /v1/payments accepted before it began requiring that — and,
 * with --apply, deletes them.
 *
 * Read-only by default. A wallet deleted after a legitimate report also leaves
 * its rows here, so read the dry run before applying.
 *
 *   pnpm --filter @4mica/be payments:purge-spoofed            # report only
 *   pnpm --filter @4mica/be payments:purge-spoofed --apply    # delete
 */
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

loadEnv({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
loadEnv({ quiet: true });

const { disconnect, prisma } = await import("@4mica/db");

interface SpoofedRow {
  id: string;
  owner_id: string;
  recipient_address: string;
  network: string;
  amount: string;
  status: string;
  created_at: Date;
}

const apply = process.argv.includes("--apply");

try {
  const rows = await prisma.$queryRaw<SpoofedRow[]>`
    SELECT p.id,
           p.owner_id,
           p.recipient_address,
           p.network::text AS network,
           p.amount::text  AS amount,
           p.status::text  AS status,
           p.created_at
      FROM payments p
     WHERE NOT EXISTS (
             SELECT 1
               FROM wallets w
              WHERE w.owner_id = p.owner_id
                AND w.address  = p.recipient_address
                AND w.network  = p.network
           )
     ORDER BY p.owner_id, p.created_at
  `;

  if (rows.length === 0) {
    console.log("No payments with an unowned recipient. Nothing to do.");
  } else {
    const byOwner = new Map<string, SpoofedRow[]>();
    for (const row of rows) {
      byOwner.set(row.owner_id, [...(byOwner.get(row.owner_id) ?? []), row]);
    }

    console.log(
      `${rows.length} payment(s) from ${byOwner.size} reporting account(s) name a recipient the reporter does not hold:\n`,
    );
    for (const [ownerId, owned] of byOwner) {
      console.log(`reporter ${ownerId} — ${owned.length} row(s)`);
      for (const row of owned) {
        console.log(
          `  ${row.id}  ${row.created_at.toISOString()}  ${row.network}  to ${row.recipient_address}  ${row.amount} ${row.status}`,
        );
      }
    }

    if (apply) {
      const { count } = await prisma.payment.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });
      console.log(`\nDeleted ${count} payment(s).`);
    } else {
      console.log(
        "\nDry run — nothing deleted. Re-run with --apply to delete.",
      );
    }
  }
} finally {
  await disconnect();
}
