import { createHash, randomUUID } from "node:crypto";
import type { ApiKeyScope, EnvironmentKind } from "@4mica/db";
import { approvalRoutes } from "@routes/approvals";
import { customerRoutes } from "@routes/customers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const url = vi.hoisted(() => {
  const value = process.env.INTEGRATION_DATABASE_URL;
  if (value) {
    process.env.DATABASE_URL = value;
  }
  return value;
});

type Db = typeof import("@4mica/db")["prisma"];

const PAYER = "0x2222222222222222222222222222222222222222";

describe.skipIf(!url)("seller approval isolation on real Postgres", () => {
  let db: Db;
  let app: Awaited<ReturnType<typeof initApp>>;
  const orgs: string[] = [];

  beforeAll(async () => {
    db = (await import("@4mica/db")).prisma;
    app = await initApp([
      { plugin: approvalRoutes },
      { plugin: customerRoutes },
    ]);
  });

  afterAll(async () => {
    await app?.close();
    if (!db) {
      return;
    }
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('fourmica.audit_retention', 'on', true)`;
      await tx.auditLog.deleteMany({ where: { organizationId: { in: orgs } } });
      await tx.apiKey.deleteMany({ where: { organizationId: { in: orgs } } });
      await tx.customer.deleteMany({ where: { organizationId: { in: orgs } } });
      await tx.organization.deleteMany({ where: { id: { in: orgs } } });
    });
    await db.$disconnect();
  });

  const seed = async () => {
    const org = await db.organization.create({ data: { name: "seller" } });
    orgs.push(org.id);
    const project = async (slug: string) => {
      const row = await db.project.create({
        data: { organizationId: org.id, slug, name: slug },
      });
      const environments = {} as Record<EnvironmentKind, string>;
      for (const kind of ["SANDBOX", "PRODUCTION"] as const) {
        environments[kind] = (
          await db.environment.create({ data: { projectId: row.id, kind } })
        ).id;
      }
      return { id: row.id, environments };
    };
    const a = await project("a");
    const b = await project("b");
    const serviceAccount = await db.serviceAccount.create({
      data: {
        organizationId: org.id,
        projectId: a.id,
        name: "billing",
      },
    });

    const key = async (
      target: { id: string; environments: Record<EnvironmentKind, string> },
      environment: EnvironmentKind,
      options: { serviceAccountId?: string; agent?: boolean } = {},
    ) => {
      const token = `4mica_sk_${environment === "PRODUCTION" ? "live" : "test"}_${randomUUID()}`;
      const agent = options.agent
        ? await db.agent.create({
            data: {
              name: `agent-${randomUUID()}`,
              organizationId: org.id,
              projectId: target.id,
              environmentId: target.environments[environment],
            },
          })
        : null;
      const scopes: ApiKeyScope[] = ["APPROVALS_WRITE", "CUSTOMERS_READ"];
      const row = await db.apiKey.create({
        data: {
          organizationId: org.id,
          projectId: target.id,
          environmentId: target.environments[environment],
          serviceAccountId: options.serviceAccountId ?? null,
          agentId: agent?.id ?? null,
          name: `key-${randomUUID()}`,
          prefix: token.slice(0, 18),
          last4: token.slice(-4),
          hashedKey: createHash("sha256").update(token).digest("hex"),
          scopes,
        },
      });
      return { id: row.id, prefix: row.prefix, token };
    };

    const customer = await db.customer.create({
      data: {
        organizationId: org.id,
        projectId: a.id,
        name: "Big buyer",
        approvalThreshold: "100",
      },
    });
    await db.customerPaymentIdentity.create({
      data: {
        customerId: customer.id,
        organizationId: org.id,
        type: "WALLET",
        network: "BASE",
        address: PAYER,
      },
    });
    const foreignCustomer = await db.customer.create({
      data: { organizationId: org.id, projectId: b.id, name: "Other" },
    });

    return {
      orgId: org.id,
      serviceAccountId: serviceAccount.id,
      customerId: customer.id,
      foreignCustomerId: foreignCustomer.id,
      creator: await key(a, "PRODUCTION", {
        serviceAccountId: serviceAccount.id,
      }),
      sibling: await key(a, "PRODUCTION"),
      sandbox: await key(a, "SANDBOX"),
      otherProject: await key(b, "PRODUCTION"),
      otherResource: await key(b, "PRODUCTION", { agent: true }),
    };
  };

  const send = (
    token: string,
    method: "GET" | "POST",
    path: string,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({
      method,
      url: path,
      headers: { authorization: `Bearer ${token}` },
      ...(payload ? { payload } : {}),
    });

  const request = { payerAddress: PAYER, network: "BASE", amount: "150" };

  it("lets every key of the creating project and environment read a seller approval, and nobody else", async () => {
    const s = await seed();
    const created = await send(s.creator.token, "POST", "/v1/approvals", {
      ...request,
      customerId: s.customerId,
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    const read = async (token: string) =>
      (await send(token, "GET", `/v1/approvals/${id}`)).statusCode;

    expect(await read(s.creator.token)).toBe(200);
    expect(await read(s.sibling.token)).toBe(200);
    expect(await read(s.sandbox.token)).toBe(404);
    expect(await read(s.otherProject.token)).toBe(404);
    expect(await read(s.otherResource.token)).toBe(404);

    const audit = await db.auditLog.findFirstOrThrow({
      where: { organizationId: s.orgId, targetId: id },
    });
    expect(audit.actorApiKeyId).toBe(s.creator.id);
    expect(audit.metadata).toMatchObject({
      environment: "PRODUCTION",
      apiKeyPrefix: s.creator.prefix,
      serviceAccountId: s.serviceAccountId,
    });
  });

  it("refuses a customer of another project and a network outside the key's environment", async () => {
    const s = await seed();

    const foreign = await send(s.creator.token, "POST", "/v1/approvals", {
      ...request,
      customerId: s.foreignCustomerId,
    });
    const crossEnvironment = await send(
      s.sandbox.token,
      "POST",
      "/v1/approvals",
      request,
    );

    expect(foreign.statusCode).toBe(404);
    expect(crossEnvironment.statusCode).toBe(403);
    expect(
      await db.approvalRequest.count({ where: { organizationId: s.orgId } }),
    ).toBe(0);
  });

  it("does not expire a production approval when a sandbox key reads it", async () => {
    const s = await seed();
    const created = await send(
      s.creator.token,
      "POST",
      "/v1/approvals",
      request,
    );
    const id = created.json().id as string;
    await db.approvalRequest.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(
      (await send(s.sandbox.token, "GET", `/v1/approvals/${id}`)).statusCode,
    ).toBe(404);
    expect(
      (await db.approvalRequest.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("PENDING");

    expect(
      (await send(s.sibling.token, "GET", `/v1/approvals/${id}`)).json().status,
    ).toBe("EXPIRED");
  });

  it("only clears the approval flag on resolve for a key of the same project and environment", async () => {
    const s = await seed();
    const created = await send(
      s.creator.token,
      "POST",
      "/v1/approvals",
      request,
    );
    const id = created.json().id as string;
    await db.approvalRequest.update({
      where: { id },
      data: { status: "APPROVED", decidedAt: new Date() },
    });

    const resolve = (token: string) =>
      send(token, "POST", "/v1/customers/resolve", {
        ...request,
        approvalRequestId: id,
      });

    const fromSandbox = await resolve(s.sandbox.token);
    expect(fromSandbox.statusCode).toBe(200);
    expect(fromSandbox.json().needsApproval).toBe(true);
    expect(
      (await db.approvalRequest.findUniqueOrThrow({ where: { id } }))
        .executedAt,
    ).toBeNull();

    const fromOtherProject = await resolve(s.otherProject.token);
    expect(fromOtherProject.json().customerId).toBeNull();
    expect(
      (await db.approvalRequest.findUniqueOrThrow({ where: { id } }))
        .executedAt,
    ).toBeNull();

    const fromSibling = await resolve(s.sibling.token);
    expect(fromSibling.json()).toMatchObject({
      customerId: s.customerId,
      needsApproval: false,
    });
    expect(
      (await db.approvalRequest.findUniqueOrThrow({ where: { id } }))
        .executedAt,
    ).not.toBeNull();
  });
});
