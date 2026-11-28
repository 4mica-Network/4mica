import { randomUUID } from "node:crypto";
import { toUnits } from "@utils/units";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inLegacySchema } from "@/test-support/legacy-schema";

const url = process.env.INTEGRATION_DATABASE_URL;

const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const PAYER = "0x1111111111111111111111111111111111111111";
const OTHER_PAYER = "0x2222222222222222222222222222222222222222";
const RECIPIENT = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";
const ELSEWHERE = "0x9999999999999999999999999999999999999999";
const MIGRATION = "20261202123000_verify_spend_payment_links";

type Db = typeof import("@4mica/db");
type Matching = typeof import("./matching");

interface Pair {
  label: string;
  authorization?: { authorizedAmount?: string | null; settledElsewhere?: true };
  payment: {
    reqId?: string;
    network?: "BASE_SEPOLIA" | "ETHEREUM_SEPOLIA";
    assetAddress?: string | null;
    payerAddress?: string;
    recipientAddress?: string;
    amount?: string;
    status?: "PENDING" | "SETTLED" | "FAILED";
  };
}

const PAIRS: Pair[] = [
  { label: "exact", payment: {} },
  { label: "partial", payment: { amount: "4" } },
  { label: "pending", payment: { status: "PENDING" } },
  { label: "over", payment: { amount: "10.000000000000000001" } },
  { label: "recipient", payment: { recipientAddress: ELSEWHERE } },
  { label: "payer", payment: { payerAddress: OTHER_PAYER } },
  { label: "network", payment: { network: "ETHEREUM_SEPOLIA" } },
  { label: "asset", payment: { assetAddress: null } },
  { label: "req id", payment: { reqId: "other" } },
  { label: "failed", payment: { status: "FAILED" } },
  {
    label: "legacy amount",
    authorization: { authorizedAmount: null },
    payment: { amount: "9" },
  },
  {
    label: "already settled",
    authorization: { settledElsewhere: true },
    payment: {},
  },
];

describe.skipIf(!url)("canonical payment matching on real Postgres", () => {
  let db: Db["prisma"];
  let Prisma: Db["Prisma"];
  let matching: Matching;
  let repository: typeof import("./repository");
  let decide: typeof import("./decide");
  let finance: typeof import("@controllers/finance/repository");
  const orgs: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ prisma: db, Prisma } = await import("@4mica/db"));
    matching = await import("./matching");
    repository = await import("./repository");
    decide = await import("./decide");
    finance = await import("@controllers/finance/repository");
  });

  afterAll(async () => {
    if (!db) {
      return;
    }
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('fourmica.audit_retention', 'on', true)`;
      await tx.auditLog.deleteMany({ where: { organizationId: { in: orgs } } });
      await tx.organization.deleteMany({ where: { id: { in: orgs } } });
    });
    await db.$disconnect();
  });

  const seedPair = async (pair: Pair, seller: string) => {
    const tag = randomUUID().replaceAll("-", "").slice(0, 8);
    const payer = `0x${tag.padEnd(40, "1")}`;
    const other = `0x${tag.padEnd(40, "2")}`;
    const org = await db.organization.create({ data: { name: pair.label } });
    orgs.push(org.id);
    const [open, restricted] = await Promise.all(
      ["open", "restricted"].map((slug) =>
        db.project.create({
          data: {
            organizationId: org.id,
            slug,
            name: slug,
            restricted: slug === "restricted",
          },
        }),
      ),
    );
    for (const network of ["BASE_SEPOLIA", "ETHEREUM_SEPOLIA"] as const) {
      for (const address of [payer, other]) {
        await db.wallet.create({
          data: {
            organizationId: org.id,
            label: `${network}-${address}`,
            address,
            network,
            role: "PAYER",
            verifiedAt: new Date(),
            verifiedChainId: 1,
          },
        });
      }
    }
    const reqId = `0x${randomUUID().replaceAll("-", "")}`;
    const now = new Date();
    const otherSeller = async () => {
      const created = await db.organization.create({
        data: { name: "other seller" },
      });
      orgs.push(created.id);
      return created.id;
    };
    const earlier = pair.authorization?.settledElsewhere
      ? await db.payment.create({
          data: {
            organizationId: await otherSeller(),
            payerAddress: payer,
            recipientAddress: RECIPIENT,
            network: "BASE_SEPOLIA",
            assetAddress: USDC,
            amount: "1",
            reqId,
            status: "SETTLED",
          },
        })
      : null;
    const authorization = await db.spendAuthorization.create({
      data: {
        organizationId: org.id,
        projectId: (restricted as { id: string }).id,
        environment: "SANDBOX",
        network: "BASE_SEPOLIA",
        assetAddress: USDC,
        payerAddress: payer,
        recipientAddress: RECIPIENT,
        amount: earlier ? "1" : "10",
        authorizedAmount:
          pair.authorization && "authorizedAmount" in pair.authorization
            ? pair.authorization.authorizedAmount
            : "10",
        reqId,
        status: "CONSUMED",
        consumedAt: now,
        expiresAt: new Date(now.getTime() + 600_000),
        ...(earlier
          ? { paymentId: earlier.id, settledAmount: "1", matchedAt: now }
          : {}),
      },
    });
    const payment = await db.payment.create({
      data: {
        organizationId: seller,
        recipientAddress: RECIPIENT,
        network: "BASE_SEPOLIA",
        assetAddress: USDC,
        amount: "10",
        status: "SETTLED",
        ...pair.payment,
        payerAddress: pair.payment.payerAddress === OTHER_PAYER ? other : payer,
        reqId:
          pair.payment.reqId === undefined
            ? reqId
            : `${reqId}-${pair.payment.reqId}`,
      },
    });
    return {
      orgId: org.id,
      open: (open as { id: string }).id,
      restricted: (restricted as { id: string }).id,
      authorization,
      payment,
      now,
    };
  };

  it("agrees between the TypeScript rule, its SQL twin, usage, reconciliation and every financial view", async () => {
    const seller = await db.organization.create({ data: { name: "seller" } });
    orgs.push(seller.id);
    const verdicts: Record<string, unknown> = {};

    for (const pair of PAIRS) {
      const seeded = await seedPair(pair, seller.id);
      const { orgId, authorization, payment, now } = seeded;
      const typescript =
        matching.paymentMismatch(authorization, payment) === null;

      const [sql] = await db.$queryRaw<{ matches: boolean; covers: boolean }[]>(
        Prisma.sql`SELECT ${matching.paymentMatchSql()} AS matches,
                          ${matching.coversPaymentSql()} AS covers
          FROM spend_authorizations a, payments p
         WHERE a.id = ${authorization.id} AND p.id = ${payment.id}`,
      );

      const usage = await repository.loadUsage(
        db,
        orgId,
        payment.network,
        payment.assetAddress,
        [],
        now,
      );

      await decide.reconcileReportedPayment(
        { ...payment, amount: payment.amount.toFixed() },
        null,
        now,
      );
      const stored = await db.spendAuthorization.findUniqueOrThrow({
        where: { id: authorization.id },
      });

      const range = {
        from: new Date(now.getTime() - 3_600_000),
        to: new Date(now.getTime() + 3_600_000),
      };
      const full = { orgId, environment: "SANDBOX" as const, projects: null };
      const limited = { ...full, projects: [seeded.open] };
      const reconciliation = await finance.financeReconciliation(
        full,
        range,
        now,
      );
      const hidden = await finance.financeReconciliation(limited, range, now);
      const attribution = await finance.financeUsage(
        full,
        range,
        "project",
        "sent",
      );
      const exported = await finance.exportPayments(
        limited,
        range,
        "sent",
        100,
      );

      verdicts[pair.label] = {
        typescript,
        sql: sql?.matches,
        covers: matching.coversPayment(authorization, payment),
        coversSql: sql?.covers,
        unmatchedInUsage: usage.payments.length,
        linked: stored.paymentId === payment.id,
        settled:
          stored.paymentId === payment.id
            ? stored.settledAmount?.toFixed()
            : null,
        matched: reconciliation.matched,
        reportedNotAuthorized: reconciliation.reportedNotAuthorized.length,
        attributedTo: attribution
          .filter((item) => toUnits(item.amount) === toUnits(payment.amount))
          .map((item) => item.key)
          .at(0),
        visibleToOtherProject:
          hidden.matched + hidden.reportedNotAuthorized.length,
        exportedToOtherProject: exported.rows.length,
      };

      const counted = payment.status !== "FAILED";
      const claimsIdentity =
        payment.reqId === authorization.reqId &&
        payment.network === authorization.network &&
        payment.assetAddress === authorization.assetAddress &&
        payment.payerAddress === authorization.payerAddress;
      const expectedEarlier = pair.authorization?.settledElsewhere ? 1 : 0;
      expect(verdicts[pair.label], pair.label).toEqual({
        typescript,
        sql: typescript,
        covers: typescript || (counted && claimsIdentity && !!expectedEarlier),
        coversSql:
          typescript || (counted && claimsIdentity && !!expectedEarlier),
        unmatchedInUsage:
          counted && !(typescript || (claimsIdentity && expectedEarlier))
            ? 1
            : 0,
        linked: typescript,
        settled: typescript ? payment.amount.toFixed() : null,
        matched: (typescript ? 1 : 0) + expectedEarlier,
        reportedNotAuthorized: counted && !typescript ? 1 : 0,
        attributedTo: counted
          ? typescript
            ? seeded.restricted
            : null
          : undefined,
        visibleToOtherProject:
          counted && !typescript && !claimsIdentity ? 1 : 0,
        exportedToOtherProject: !typescript && !claimsIdentity ? 1 : 0,
      });
    }

    expect(
      Object.fromEntries(
        Object.entries(verdicts).map(([label, verdict]) => [
          label,
          (verdict as { typescript: boolean }).typescript,
        ]),
      ),
    ).toEqual({
      exact: true,
      partial: true,
      pending: true,
      over: false,
      recipient: false,
      payer: false,
      network: false,
      asset: false,
      "req id": false,
      failed: false,
      "legacy amount": true,
      "already settled": false,
    });
  }, 300_000);

  it("refuses to rewrite a settled association at the database", async () => {
    const seller = await db.organization.create({ data: { name: "seller" } });
    orgs.push(seller.id);
    const { authorization, payment, now } = await seedPair(
      { label: "immutable", payment: {} },
      seller.id,
    );
    await decide.reconcileReportedPayment(
      { ...payment, amount: payment.amount.toFixed() },
      null,
      now,
    );
    await expect(
      db.spendAuthorization.update({
        where: { id: authorization.id },
        data: { settledAmount: "1" },
      }),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.spendAuthorization.update({
        where: { id: authorization.id },
        data: { paymentId: null, settledAmount: null, matchedAt: null },
      }),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.spendAuthorization.create({
        data: {
          organizationId: authorization.organizationId,
          projectId: authorization.projectId,
          environment: "SANDBOX",
          network: "BASE_SEPOLIA",
          payerAddress: authorization.payerAddress,
          recipientAddress: RECIPIENT,
          amount: "1",
          status: "CONSUMED",
          expiresAt: now,
          paymentId: payment.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("keeps only verifiable legacy links", async () => {
    await inLegacySchema(db, MIGRATION, async (tx, migrate) => {
      await tx.$executeRawUnsafe(`
        INSERT INTO organizations (id, name, updated_at) VALUES ('org', 'legacy', now()), ('seller', 'seller', now());
        INSERT INTO projects (id, organization_id, slug, name, updated_at)
             VALUES ('project', 'org', 'default', 'Default', now());
        INSERT INTO payments
               (id, organization_id, payer_address, recipient_address, network,
                asset_address, amount, req_id, status, updated_at)
        VALUES ('p-good', 'seller', '${PAYER}', '${RECIPIENT}', 'BASE_SEPOLIA', '${USDC}', 4, 'r-good', 'SETTLED', now()),
               ('p-recipient', 'seller', '${PAYER}', '${ELSEWHERE}', 'BASE_SEPOLIA', '${USDC}', 4, 'r-recipient', 'SETTLED', now()),
               ('p-failed', 'seller', '${PAYER}', '${RECIPIENT}', 'BASE_SEPOLIA', '${USDC}', 4, 'r-failed', 'FAILED', now()),
               ('p-shared', 'seller', '${PAYER}', '${RECIPIENT}', 'BASE_SEPOLIA', '${USDC}', 4, 'r-shared', 'SETTLED', now());
      `);
      const row = (
        id: string,
        reqId: string,
        payment: string,
        amount: string,
        authorized: string | null,
        settled: string | null,
        minutes: number,
      ) => `('${id}', 'org', 'project', 'SANDBOX', 'BASE_SEPOLIA', '${USDC}',
        '${PAYER}', '${RECIPIENT}', ${amount}, ${authorized ?? "NULL"}, ${settled ?? "NULL"},
        '${reqId}', 'CONSUMED', '${payment}', now() - interval '${minutes} minutes',
        now(), now() - interval '${minutes} minutes', now())`;
      await tx.$executeRawUnsafe(`
        INSERT INTO spend_authorizations
               (id, organization_id, project_id, environment, network, asset_address,
                payer_address, recipient_address, amount, authorized_amount, settled_amount,
                req_id, status, payment_id, consumed_at, expires_at, created_at, updated_at)
        VALUES ${[
          row("consume-linked", "r-good", "p-good", "10", "10", null, 30),
          row("recipient", "r-recipient", "p-recipient", "10", "10", null, 30),
          row("failed", "r-failed", "p-failed", "4", null, "4", 30),
          row("shared-first", "r-shared", "p-shared", "4", null, "4", 30),
          row("shared-second", "r-shared-2", "p-shared", "4", null, "4", 20),
        ].join(",")}
      `);

      await tx.$executeRawUnsafe(
        "UPDATE spend_authorizations SET req_id_conflict = 'duplicate_req_id' WHERE id = 'shared-second'",
      );

      await migrate();

      expect(
        await tx.$queryRawUnsafe(
          `SELECT id, payment_id, amount::float8 AS amount, settled_amount::float8 AS settled,
                  matched_at IS NOT NULL AS matched
             FROM spend_authorizations ORDER BY id`,
        ),
      ).toEqual([
        {
          id: "consume-linked",
          payment_id: "p-good",
          amount: 4,
          settled: 4,
          matched: true,
        },
        {
          id: "failed",
          payment_id: null,
          amount: 4,
          settled: null,
          matched: false,
        },
        {
          id: "recipient",
          payment_id: null,
          amount: 10,
          settled: null,
          matched: false,
        },
        {
          id: "shared-first",
          payment_id: "p-shared",
          amount: 4,
          settled: 4,
          matched: true,
        },
        {
          id: "shared-second",
          payment_id: null,
          amount: 4,
          settled: null,
          matched: false,
        },
      ]);
    });
  }, 300_000);
});
