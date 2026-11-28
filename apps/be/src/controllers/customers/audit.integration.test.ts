import { randomUUID } from "node:crypto";
import type { ProjectScope } from "@auth/project";
import type { FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.INTEGRATION_DATABASE_URL;

type Db = typeof import("@4mica/db");
type Shared = typeof import("@controllers/shared");
type Repository = typeof import("./repository");
type Tracking = typeof import("@controllers/audit/external-operations");

describe.skipIf(!url)("audited customer changes on real Postgres", () => {
  let db: Db["prisma"];
  let withProjectAudit: Shared["withProjectAudit"];
  let repo: Repository;
  let trackExternalOperation: Tracking["trackExternalOperation"];
  const orgs: string[] = [];
  const users: string[] = [];
  const request = { ip: "203.0.113.9" } as FastifyRequest;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = (await import("@4mica/db")).prisma;
    withProjectAudit = (await import("@controllers/shared")).withProjectAudit;
    repo = await import("./repository");
    trackExternalOperation = (
      await import("@controllers/audit/external-operations")
    ).trackExternalOperation;
  });

  afterAll(async () => {
    if (!db) {
      return;
    }
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('fourmica.audit_retention', 'on', true)`;
      await tx.auditLog.deleteMany({ where: { organizationId: { in: orgs } } });
      await tx.externalOperation.deleteMany({
        where: { organizationId: { in: orgs } },
      });
      await tx.organization.deleteMany({ where: { id: { in: orgs } } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
    });
    await db.$disconnect();
  });

  const seed = async () => {
    const user = await db.user.create({
      data: { clerkUserId: `user_${randomUUID()}` },
    });
    users.push(user.id);
    const org = await db.organization.create({ data: { name: "audit" } });
    orgs.push(org.id);
    const project = await db.project.create({
      data: { organizationId: org.id, slug: "default", name: "Default" },
    });
    const customer = await db.customer.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        name: "Acme",
        dailyLimit: "100",
        approvalThreshold: "40",
        identities: {
          create: {
            organizationId: org.id,
            type: "EMAIL",
            value: `ops-${randomUUID()}@acme.test`,
            source: "MANUAL",
          },
        },
      },
    });
    const scope = {
      orgId: org.id,
      userId: user.id,
      projectId: project.id,
      environment: "SANDBOX",
    } as ProjectScope;
    return { scope, customer };
  };

  const auditRows = (orgId: string) =>
    db.auditLog.findMany({ where: { organizationId: orgId } });

  const TOO_LONG = "x".repeat(65);

  it("commits a limit change with its before and after values", async () => {
    const { scope, customer } = await seed();

    await withProjectAudit(
      request,
      scope,
      (tx) =>
        repo.setCustomerPolicy(
          scope,
          customer.id,
          { dailyLimit: "250", approvalThreshold: null },
          tx,
        ),
      (change) =>
        change && {
          action: "customer.limits_updated",
          targetType: "customer",
          targetId: customer.id,
          metadata: { before: change.before, after: change.after },
        },
    );

    const stored = await db.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(stored.dailyLimit?.toString()).toBe("250");
    const [row] = await auditRows(scope.orgId);
    expect(row?.action).toBe("customer.limits_updated");
    expect(row?.metadata).toEqual({
      projectId: scope.projectId,
      environment: "SANDBOX",
      before: { dailyLimit: "100", approvalThreshold: "40" },
      after: { dailyLimit: "250", approvalThreshold: null },
    });
  });

  it("rolls the limit change back when its audit entry cannot be written", async () => {
    const { scope, customer } = await seed();

    await expect(
      withProjectAudit(
        request,
        scope,
        (tx) =>
          repo.setCustomerPolicy(scope, customer.id, { dailyLimit: "1" }, tx),
        {
          action: "customer.limits_updated",
          targetType: "customer",
          targetId: TOO_LONG,
        },
      ),
    ).rejects.toThrow();

    const stored = await db.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(stored.dailyLimit?.toString()).toBe("100");
    expect(await auditRows(scope.orgId)).toEqual([]);
  });

  it("rolls a delete back, identities included, when its audit entry fails", async () => {
    const { scope, customer } = await seed();

    await expect(
      withProjectAudit(
        request,
        scope,
        (tx) => repo.softDeleteCustomer(scope, customer.id, tx),
        { action: "customer.deleted", targetId: TOO_LONG },
      ),
    ).rejects.toThrow();

    const stored = await db.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(stored.deletedAt).toBeNull();
    expect(
      await db.customerPaymentIdentity.count({
        where: { customerId: customer.id },
      }),
    ).toBe(1);
  });

  it("serialises concurrent limit changes so each audit sees the true before value", async () => {
    const { scope, customer } = await seed();

    await Promise.all(
      ["300", "400", "500"].map((dailyLimit) =>
        withProjectAudit(
          request,
          scope,
          (tx) =>
            repo.setCustomerPolicy(scope, customer.id, { dailyLimit }, tx),
          (change) =>
            change && {
              action: "customer.limits_updated",
              targetId: customer.id,
              metadata: { before: change.before, after: change.after },
            },
        ),
      ),
    );

    const chain = (await auditRows(scope.orgId))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(
        (row) =>
          row.metadata as {
            before: { dailyLimit: string };
            after: { dailyLimit: string };
          },
      );
    const befores = chain.map((entry) => entry.before.dailyLimit);
    const afters = chain.map((entry) => entry.after.dailyLimit);
    expect(new Set(befores).size).toBe(3);
    expect(befores).toContain("100");
    for (const before of befores.filter((value) => value !== "100")) {
      expect(afters).toContain(before);
    }
  });

  it("keeps a durable record of an ambiguous external call", async () => {
    const { scope } = await seed();
    let during: unknown;

    await expect(
      trackExternalOperation(
        {
          orgId: scope.orgId,
          actorUserId: scope.userId,
          kind: "clerk.sessions.revoke",
          targetType: "user",
          targetId: scope.userId,
        },
        async () => {
          during = await db.externalOperation.findFirst({
            where: { organizationId: scope.orgId },
          });
          throw new TypeError("fetch failed");
        },
      ),
    ).rejects.toThrow("fetch failed");

    expect(during).toMatchObject({ status: "PENDING", completedAt: null });
    const settled = await db.externalOperation.findFirstOrThrow({
      where: { organizationId: scope.orgId },
    });
    expect(settled).toMatchObject({ status: "UNKNOWN", error: "fetch failed" });
    expect(settled.completedAt).toBeInstanceOf(Date);
  });
});
