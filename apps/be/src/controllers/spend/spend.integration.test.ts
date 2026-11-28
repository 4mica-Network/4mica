import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.INTEGRATION_DATABASE_URL;

const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const PAYER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";

type Db = typeof import("@4mica/db");
type Decide = typeof import("./decide");

describe.skipIf(!url)("spend authorization on real Postgres", () => {
  let db: Db["prisma"];
  let authorizeSpend: Decide["authorizeSpend"];
  const orgs: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = (await import("@4mica/db")).prisma;
    authorizeSpend = (await import("./decide")).authorizeSpend;
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

  const seedOrg = async (keys: number) => {
    const org = await db.organization.create({ data: { name: "concurrency" } });
    orgs.push(org.id);
    const project = await db.project.create({
      data: { organizationId: org.id, slug: "default", name: "Default" },
    });
    const environment = await db.environment.create({
      data: { projectId: project.id, kind: "SANDBOX" },
    });
    await db.wallet.create({
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
    await db.spendingPolicy.create({
      data: {
        organizationId: org.id,
        name: "Daily cap",
        scope: "ORGANIZATION",
        mode: "ENFORCE",
        network: "BASE_SEPOLIA",
        assetAddress: USDC,
        dailyLimit: "100",
      },
    });
    const principals = [];
    for (let index = 0; index < keys; index++) {
      const agent = await db.agent.create({
        data: {
          name: `agent-${index}`,
          organizationId: org.id,
          projectId: project.id,
          environmentId: environment.id,
        },
      });
      const key = await db.apiKey.create({
        data: {
          organizationId: org.id,
          projectId: project.id,
          environmentId: environment.id,
          agentId: agent.id,
          name: `key-${index}`,
          prefix: "4mica_sk_test",
          last4: "0000",
          hashedKey: randomUUID(),
          scopes: ["SPEND_AUTHORIZE"],
        },
      });
      principals.push({ apiKeyId: key.id, agentId: agent.id });
    }
    return { orgId: org.id, projectId: project.id, principals };
  };

  const burst = async (keys: number) => {
    const { orgId, projectId, principals } = await seedOrg(keys);
    const outcomes = await Promise.all(
      Array.from({ length: 100 }, (_, index) => {
        const principal = principals[index % principals.length] as {
          apiKeyId: string;
          agentId: string;
        };
        return authorizeSpend({
          orgId,
          projectId,
          environment: "SANDBOX",
          apiKeyId: principal.apiKeyId,
          agentId: principal.agentId,
          agentName: null,
          network: "BASE_SEPOLIA",
          assetAddress: USDC,
          amount: "10",
          payerAddress: PAYER,
          recipientAddress: RECIPIENT,
          reqId: null,
        });
      }),
    );
    const statuses = outcomes.map((outcome) =>
      outcome.kind === "ok" ? outcome.row.status : outcome.kind,
    );
    const persisted = await db.spendAuthorization.aggregate({
      where: { organizationId: orgId, status: "RESERVED" },
      _sum: { amount: true },
    });
    return {
      reserved: statuses.filter((status) => status === "RESERVED").length,
      denied: statuses.filter((status) => status === "DENIED").length,
      sum: Number(persisted._sum.amount ?? 0),
      byKey: await db.spendAuthorization.groupBy({
        by: ["apiKeyId", "status"],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
    };
  };

  it("reserves exactly ten of a hundred concurrent $10 requests under a $100 daily limit", async () => {
    const result = await burst(1);
    expect(result.reserved).toBe(10);
    expect(result.denied).toBe(90);
    expect(result.sum).toBeLessThanOrEqual(100);
  }, 120_000);

  it("holds the same limit across two API keys and agents of one organization", async () => {
    const result = await burst(2);
    expect(result.reserved).toBe(10);
    expect(result.denied).toBe(90);
    expect(result.sum).toBeLessThanOrEqual(100);
    expect(new Set(result.byKey.map((row) => row.apiKeyId)).size).toBe(2);
  }, 120_000);
});
