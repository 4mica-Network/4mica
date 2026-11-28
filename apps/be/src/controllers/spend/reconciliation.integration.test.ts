import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.INTEGRATION_DATABASE_URL;

const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const RECIPIENT = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";

type Db = typeof import("@4mica/db");

describe.skipIf(!url)("durable payment reconciliation on real Postgres", () => {
  let db: Db["prisma"];
  let decide: typeof import("./decide");
  let repository: typeof import("./repository");
  let payments: typeof import("@controllers/payments/repository");
  let finance: typeof import("@controllers/finance/repository");
  let sweep: typeof import("@/jobs/reconciliation/processor");
  const orgs: string[] = [];
  const logger = { info: () => {}, warn: () => {}, error: () => {} };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = (await import("@4mica/db")).prisma;
    decide = await import("./decide");
    repository = await import("./repository");
    payments = await import("@controllers/payments/repository");
    finance = await import("@controllers/finance/repository");
    sweep = await import("@/jobs/reconciliation/processor");
  });

  afterAll(async () => {
    if (!db) {
      return;
    }
    await db.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS reconciliation_fault ON spend_authorizations; DROP FUNCTION IF EXISTS reconciliation_fault();",
    );
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('fourmica.audit_retention', 'on', true)`;
      await tx.auditLog.deleteMany({ where: { organizationId: { in: orgs } } });
      await tx.organization.deleteMany({ where: { id: { in: orgs } } });
    });
    await db.$disconnect();
  });

  const seed = async () => {
    const payer = `0x${randomUUID().replaceAll("-", "").slice(0, 8).padEnd(40, "3")}`;
    const org = await db.organization.create({ data: { name: "buyer" } });
    const seller = await db.organization.create({ data: { name: "seller" } });
    orgs.push(org.id, seller.id);
    const project = await db.project.create({
      data: { organizationId: org.id, slug: "default", name: "Default" },
    });
    const sellerProject = await db.project.create({
      data: { organizationId: seller.id, slug: "default", name: "Default" },
    });
    const environment = await db.environment.create({
      data: { projectId: project.id, kind: "SANDBOX" },
    });
    await db.wallet.create({
      data: {
        organizationId: org.id,
        label: "payer",
        address: payer,
        network: "BASE_SEPOLIA",
        role: "PAYER",
        verifiedAt: new Date(),
        verifiedChainId: 84532,
      },
    });
    const key = await db.apiKey.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        environmentId: environment.id,
        name: "agent",
        prefix: "4mica_sk_test",
        last4: "0000",
        hashedKey: randomUUID(),
        scopes: ["SPEND_AUTHORIZE"],
      },
    });
    const reqId = `0x${randomUUID().replaceAll("-", "")}`;
    const authorize = async () => {
      const outcome = await decide.authorizeSpend({
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
        amount: "10",
        payerAddress: payer,
        recipientAddress: RECIPIENT,
        reqId,
      });
      if (outcome.kind !== "ok") {
        throw new Error("authorization failed");
      }
      return outcome.row;
    };
    const report = (status: "PENDING" | "SETTLED" = "SETTLED") =>
      payments.reportPayment(
        seller.id,
        sellerProject.id,
        {
          reqId,
          payerAddress: payer,
          recipientAddress: RECIPIENT,
          network: "BASE_SEPOLIA",
          assetAddress: USDC,
          amount: "6",
          status,
        } as Parameters<typeof payments.reportPayment>[2],
        { listingId: null, agentId: null },
      );
    const owner = repository.authorizationOwner({
      id: key.id,
      orgId: org.id,
      projectId: project.id,
      environmentId: environment.id,
      environment: "SANDBOX",
      serviceAccountId: null,
      prefix: key.prefix,
      scopes: ["SPEND_AUTHORIZE"],
      listingId: null,
      agentId: null,
    });
    const stored = (id: string) =>
      db.payment.findUniqueOrThrow({
        where: { id },
        select: {
          reconciliationState: true,
          reconcileAttempts: true,
          reconcileError: true,
          reconcileAfter: true,
          reconciledAt: true,
        },
      });
    const audits = async () =>
      (
        await db.auditLog.findMany({
          where: { organizationId: org.id, action: { startsWith: "spend." } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { action: true },
        })
      ).map((row) => row.action);
    return {
      orgId: org.id,
      reqId,
      authorize,
      report,
      owner,
      stored,
      audits,
      scope: {
        orgId: org.id,
        environment: "SANDBOX" as const,
        projects: null,
      },
    };
  };

  const run = (now: Date) =>
    sweep.runReconciliation({ logger, now: () => now, batch: 10_000 });

  const faultFor = async (reqId: string) =>
    db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION reconciliation_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.req_id = '${reqId}' AND NEW.payment_id IS NOT NULL THEN
          RAISE EXCEPTION 'injected reconciliation fault';
        END IF;
        RETURN NEW;
      END;
      $$;
      DROP TRIGGER IF EXISTS reconciliation_fault ON spend_authorizations;
      CREATE TRIGGER reconciliation_fault BEFORE UPDATE ON spend_authorizations
        FOR EACH ROW EXECUTE FUNCTION reconciliation_fault();
    `);
  const clearFault = () =>
    db.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS reconciliation_fault ON spend_authorizations",
    );

  it("resumes a reconciliation that never ran after the payment was stored", async () => {
    const pair = await seed();
    const authorization = await pair.authorize();
    expect(
      (
        await decide.consumeAuthorization(
          pair.owner,
          authorization.id,
          pair.reqId,
        )
      ).kind,
    ).toBe("ok");
    const reported = await pair.report();
    if (reported.kind === "conflict") {
      throw new Error("report failed");
    }
    expect(await pair.stored(reported.row.id)).toMatchObject({
      reconciliationState: "PENDING",
      reconciledAt: null,
    });
    expect(
      (
        await finance.financeReconciliation(pair.scope, {
          from: new Date(Date.now() - 3_600_000),
          to: new Date(Date.now() + 3_600_000),
        })
      ).backlog.pending,
    ).toBe(1);

    await run(new Date());

    expect(await pair.stored(reported.row.id)).toMatchObject({
      reconciliationState: "RECONCILED",
    });
    expect(
      await db.spendAuthorization.findUniqueOrThrow({
        where: { id: authorization.id },
        select: {
          paymentId: true,
          settledAmount: true,
          authorizedAmount: true,
        },
      }),
    ).toMatchObject({ paymentId: reported.row.id });
    expect(await pair.audits()).toEqual(["spend.consumed", "spend.reconciled"]);
  });

  it("is idempotent for duplicate and out-of-order reports", async () => {
    const pair = await seed();
    const first = await pair.report("PENDING");
    if (first.kind === "conflict") {
      throw new Error("report failed");
    }
    const payment = first.row;
    expect(await decide.reconcileReportedPayment(payment)).toBe("reconciled");
    expect(await pair.audits()).toEqual([]);

    const again = await pair.report("PENDING");
    expect(again.kind).toBe("updated");
    expect(await decide.reconcileReportedPayment(payment)).toBe("skipped");

    const authorization = await pair.authorize();
    expect(
      (
        await decide.consumeAuthorization(
          pair.owner,
          authorization.id,
          pair.reqId,
        )
      ).kind,
    ).toBe("ok");
    const linked = await db.spendAuthorization.findUniqueOrThrow({
      where: { id: authorization.id },
    });
    expect(linked.paymentId).toBe(first.row.id);
    expect(linked.settledAmount?.toFixed()).toBe("6");
    expect(linked.authorizedAmount?.toFixed()).toBe("10");

    const settled = await pair.report("SETTLED");
    expect(settled.kind).toBe("updated");
    expect((await pair.stored(first.row.id)).reconciliationState).toBe(
      "PENDING",
    );
    expect(
      await decide.reconcileReportedPayment({ ...payment, status: "SETTLED" }),
    ).toBe("reconciled");
    expect(await decide.reconcileReportedPayment(payment)).toBe("skipped");
    expect(await pair.audits()).toEqual(["spend.consumed", "spend.reconciled"]);
  });

  it("retries a reconciliation that hit a database error", async () => {
    const pair = await seed();
    const authorization = await pair.authorize();
    await decide.consumeAuthorization(pair.owner, authorization.id, pair.reqId);
    await faultFor(pair.reqId);
    const reported = await pair.report();
    if (reported.kind === "conflict") {
      throw new Error("report failed");
    }
    const now = new Date();
    try {
      expect(
        await decide.reconcileReportedPayment(reported.row, null, now),
      ).toBe("failed");
    } finally {
      await clearFault();
    }
    const failed = await pair.stored(reported.row.id);
    expect(failed).toMatchObject({
      reconciliationState: "PENDING",
      reconcileAttempts: 1,
    });
    expect(failed.reconcileError).toContain("injected reconciliation fault");
    expect(failed.reconcileAfter.getTime() - now.getTime()).toBe(30_000);
    expect(
      (
        await db.spendAuthorization.findUniqueOrThrow({
          where: { id: authorization.id },
        })
      ).paymentId,
    ).toBeNull();

    const early = await run(new Date(now.getTime() + 1_000));
    expect((await pair.stored(reported.row.id)).reconciliationState).toBe(
      "PENDING",
    );
    expect(early.backlog.pending).toBeGreaterThanOrEqual(1);

    await run(new Date(now.getTime() + 31_000));
    expect((await pair.stored(reported.row.id)).reconciliationState).toBe(
      "RECONCILED",
    );
    expect(
      (
        await db.spendAuthorization.findUniqueOrThrow({
          where: { id: authorization.id },
        })
      ).paymentId,
    ).toBe(reported.row.id);
  });

  it("dead-letters a payment as UNRESOLVED after the last attempt", async () => {
    const pair = await seed();
    const authorization = await pair.authorize();
    await decide.consumeAuthorization(pair.owner, authorization.id, pair.reqId);
    await faultFor(pair.reqId);
    let reportedId = "";
    try {
      const reported = await pair.report();
      if (reported.kind === "conflict") {
        throw new Error("report failed");
      }
      reportedId = reported.row.id;
      let now = new Date();
      for (
        let attempt = 0;
        attempt < repository.RECONCILE_MAX_ATTEMPTS;
        attempt++
      ) {
        await decide.reconcileReportedPayment(reported.row, null, now);
        now = new Date(
          now.getTime() + repository.reconcileDelayMs(attempt) + 1,
        );
      }
    } finally {
      await clearFault();
    }
    const dead = await pair.stored(reportedId);
    expect(dead).toMatchObject({
      reconciliationState: "UNRESOLVED",
      reconcileAttempts: repository.RECONCILE_MAX_ATTEMPTS,
    });
    expect(dead.reconcileError).toContain("injected reconciliation fault");

    const swept = await run(new Date(Date.now() + 86_400_000));
    expect((await pair.stored(reportedId)).reconciliationState).toBe(
      "UNRESOLVED",
    );
    expect(swept.backlog.unresolved).toBeGreaterThanOrEqual(1);
    const backlog = (
      await finance.financeReconciliation(pair.scope, {
        from: new Date(Date.now() - 3_600_000),
        to: new Date(Date.now() + 3_600_000),
      })
    ).backlog;
    expect(backlog).toMatchObject({ pending: 0, unresolved: 1 });
    expect(backlog.oldestUnresolvedAt).not.toBeNull();
  });
});
