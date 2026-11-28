import { performance } from "node:perf_hooks";

const url = process.env.INTEGRATION_DATABASE_URL;
if (!url) {
  console.error("Set INTEGRATION_DATABASE_URL to a scratch database.");
  process.exit(1);
}
process.env.DATABASE_URL = url;
process.env.LOG_LEVEL ??= "error";
process.env.CLERK_PUBLISHABLE_KEY ??=
  "pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk";
process.env.CLERK_SECRET_KEY ??=
  "sk_test_000000000000000000000000000000000000000000";
process.env.PUBLIC_API_URL ??= "http://api.test";
process.env.APP_URL ??= "http://app.test";
process.env.UNSUBSCRIBE_SECRET ??= "bench-unsubscribe-secret-at-least-32-chars";

const { Prisma, prisma } = await import("@4mica/db");
const { authorizeSpend } = await import("@controllers/spend/decide");
const { coversPaymentSql } = await import("@controllers/spend/matching");

const sizes = (process.env.BENCH_SIZES ?? "1000,10000,100000")
  .split(",")
  .map(Number);
const calls = Number(process.env.BENCH_CALLS ?? 200);

const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const PAYER = `0x${Date.now().toString(16).padStart(40, "1")}`;
const RECIPIENT = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";

const percentile = (sorted: number[], p: number): number =>
  sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ] ?? Number.NaN;

const seed = async (size: number) => {
  const org = await prisma.organization.create({
    data: { name: `bench-${size}` },
  });
  const seller = await prisma.organization.create({
    data: { name: `bench-seller-${size}` },
  });
  const project = await prisma.project.create({
    data: { organizationId: org.id, slug: "default", name: "Default" },
  });
  const environment = await prisma.environment.create({
    data: { projectId: project.id, kind: "SANDBOX" },
  });
  await prisma.wallet.create({
    data: {
      organizationId: org.id,
      label: "payer",
      address: PAYER,
      network: "BASE_SEPOLIA",
      role: "PAYER",
      verifiedAt: new Date(),
      verifiedChainId: 84532,
    },
  });
  await prisma.spendingPolicy.create({
    data: {
      organizationId: org.id,
      name: "Caps",
      scope: "ORGANIZATION",
      mode: "ENFORCE",
      network: "BASE_SEPOLIA",
      assetAddress: USDC,
      dailyLimit: "1000000000",
      monthlyLimit: "1000000000",
    },
  });
  const key = await prisma.apiKey.create({
    data: {
      organizationId: org.id,
      projectId: project.id,
      environmentId: environment.id,
      name: "bench",
      prefix: "4mica_sk_test",
      last4: "0000",
      hashedKey: `bench-${org.id}`,
      scopes: ["SPEND_AUTHORIZE"],
    },
  });

  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const span = Math.max(1, now.getTime() - monthStart.getTime() - 60_000);

  await prisma.$executeRaw`
    INSERT INTO spend_authorizations
      (id, organization_id, project_id, environment, api_key_id, network,
       asset_address, payer_address, recipient_address, amount, req_id,
       status, expires_at, consumed_at, created_at, updated_at)
    SELECT gen_random_uuid()::text, ${org.id}, ${project.id}, 'SANDBOX',
           ${key.id}, 'BASE_SEPOLIA', ${USDC}, ${PAYER}, ${RECIPIENT}, 1,
           'bench-' || ${org.id} || '-' || i, 'CONSUMED',
           t + interval '10 minutes', t, t, t
      FROM generate_series(1, ${size}::int) AS i,
           LATERAL (SELECT ${monthStart}::timestamp
                          + (i::float8 / ${size}::float8) * (${span}::float8 * interval '1 millisecond') AS t) AS ts
  `;
  await prisma.$executeRaw`
    INSERT INTO payments
      (id, organization_id, payer_address, recipient_address, network,
       asset_address, amount, req_id, status, created_at, updated_at)
    SELECT gen_random_uuid()::text, ${seller.id}, ${PAYER}, ${RECIPIENT},
           'BASE_SEPOLIA', ${USDC}, 1,
           CASE WHEN i % 100 = 0 THEN 'rogue-' ELSE 'bench-' END || ${org.id} || '-' || i,
           'SETTLED', t, t
      FROM generate_series(1, ${size}::int) AS i,
           LATERAL (SELECT ${monthStart}::timestamp
                          + (i::float8 / ${size}::float8) * (${span}::float8 * interval '1 millisecond') AS t) AS ts
  `;
  await prisma.$executeRawUnsafe("ANALYZE spend_authorizations");
  await prisma.$executeRawUnsafe("ANALYZE payments");
  return { org, seller, project, key, monthStart };
};

const explain = async (label: string, query: ReturnType<typeof Prisma.sql>) => {
  const rows = await prisma.$queryRaw<{ "QUERY PLAN": string }[]>(
    Prisma.sql`EXPLAIN (ANALYZE, BUFFERS) ${query}`,
  );
  console.log(`  EXPLAIN ${label}`);
  for (const row of rows) {
    console.log(`    ${row["QUERY PLAN"]}`);
  }
};

const report = async (size: number) => {
  const started = performance.now();
  const { org, seller, project, key, monthStart } = await seed(size);
  console.log(
    `size=${size} seeded in ${((performance.now() - started) / 1000).toFixed(1)}s`,
  );

  const timings: number[] = [];
  for (let index = 0; index < calls; index++) {
    const t0 = performance.now();
    const outcome = await authorizeSpend({
      orgId: org.id,
      projectId: project.id,
      environment: "SANDBOX",
      apiKeyId: key.id,
      apiKeyPrefix: key.prefix,
      serviceAccountId: null,
      agentId: null,
      agentName: null,
      network: "BASE_SEPOLIA",
      assetAddress: USDC,
      amount: "1",
      payerAddress: PAYER,
      recipientAddress: RECIPIENT,
      reqId: null,
    });
    timings.push(performance.now() - t0);
    if (outcome.kind !== "ok" || outcome.row.status !== "RESERVED") {
      throw new Error(`unexpected outcome ${JSON.stringify(outcome)}`);
    }
  }
  timings.sort((a, b) => a - b);
  console.log(
    `  authorize x${calls}: p50=${percentile(timings, 50).toFixed(1)}ms p95=${percentile(timings, 95).toFixed(1)}ms p99=${percentile(timings, 99).toFixed(1)}ms max=${(timings.at(-1) ?? 0).toFixed(1)}ms`,
  );

  const now = new Date();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  await explain(
    "row-loading authorizations (before)",
    Prisma.sql`SELECT id, req_id, status, amount, created_at, expires_at, project_id, agent_id, api_key_id
      FROM spend_authorizations
     WHERE organization_id = ${org.id} AND network = 'BASE_SEPOLIA' AND asset_address = ${USDC}
       AND status IN ('CONSUMED','RESERVED','PENDING_APPROVAL') AND created_at >= ${monthStart}`,
  );
  await explain(
    "row-loading payments (before)",
    Prisma.sql`SELECT req_id, amount, created_at, payer_address FROM payments
     WHERE payer_address IN (${PAYER}) AND network = 'BASE_SEPOLIA' AND asset_address = ${USDC}
       AND status <> 'FAILED' AND created_at >= ${monthStart}`,
  );
  await explain(
    "authorization aggregate (after)",
    Prisma.sql`SELECT project_id, agent_id, api_key_id, status, SUM(amount) AS amount
       FROM spend_authorizations
      WHERE organization_id = ${org.id} AND network = 'BASE_SEPOLIA'
        AND asset_address = ${USDC} AND created_at >= ${monthStart}
        AND (status = 'CONSUMED' OR (status IN ('RESERVED','PENDING_APPROVAL') AND expires_at > ${now}))
      GROUP BY 1, 2, 3, 4`,
  );
  await explain(
    "unmatched payment aggregate (after)",
    Prisma.sql`SELECT u.payer_address, u.created_at >= ${dayStart} AS today, SUM(u.amount) AS amount,
            CASE WHEN u.req_id = ${null}::varchar THEN u.req_id END AS req_id
       FROM (
         SELECT DISTINCT ON (p.payer_address, p.req_id)
                p.req_id, p.payer_address, p.recipient_address, p.amount, p.created_at
           FROM payments p
          WHERE p.payer_address IN (${PAYER})
            AND p.network = 'BASE_SEPOLIA' AND p.asset_address IS NOT DISTINCT FROM ${USDC}
            AND p.status <> 'FAILED' AND p.created_at >= ${monthStart}
            AND NOT EXISTS (
              SELECT 1 FROM spend_authorizations a
               WHERE a.organization_id = ${org.id} AND a.req_id = p.req_id
                 AND a.network = 'BASE_SEPOLIA' AND a.asset_address IS NOT DISTINCT FROM ${USDC}
                 AND a.created_at >= ${monthStart}
                 AND (a.status = 'CONSUMED' OR (a.status IN ('RESERVED','PENDING_APPROVAL') AND a.expires_at > ${now}))
                 AND ${coversPaymentSql()})
          ORDER BY p.payer_address, p.req_id, p.created_at, p.id
       ) u
      GROUP BY 1, 2, 4`,
  );

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('fourmica.audit_retention', 'on', true)`;
      await tx.auditLog.deleteMany({
        where: { organizationId: { in: [org.id, seller.id] } },
      });
      await tx.payment.deleteMany({ where: { organizationId: seller.id } });
      await tx.organization.deleteMany({
        where: { id: { in: [org.id, seller.id] } },
      });
    },
    { timeout: 600_000 },
  );
};

for (const size of sizes) {
  await report(size);
}
await prisma.$disconnect();
