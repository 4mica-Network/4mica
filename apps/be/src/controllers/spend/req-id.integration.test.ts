import { randomUUID } from "node:crypto";
import type { ApiKeyContext } from "@auth/api-key";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inLegacySchema } from "@/test-support/legacy-schema";

const url = process.env.INTEGRATION_DATABASE_URL;

const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const PAYER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";
const MIGRATION = "20261202120000_enforce_spend_req_id_uniqueness";

type Instance = typeof import("./decide") &
  typeof import("./repository") & {
    prisma: typeof import("@4mica/db")["prisma"];
  };

const instance = async (): Promise<Instance> => {
  delete (globalThis as { __4micaPrisma?: unknown }).__4micaPrisma;
  vi.resetModules();
  const { prisma } = await import("@4mica/db");
  return {
    ...(await import("./decide")),
    ...(await import("./repository")),
    prisma,
  };
};

describe.skipIf(!url)("request id uniqueness on real Postgres", () => {
  let first: Instance;
  let second: Instance;
  const orgs: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    first = await instance();
    second = await instance();
  });

  afterAll(async () => {
    if (!first) {
      return;
    }
    await first.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('fourmica.audit_retention', 'on', true)`;
      await tx.auditLog.deleteMany({ where: { organizationId: { in: orgs } } });
      await tx.organization.deleteMany({ where: { id: { in: orgs } } });
    });
    await first.prisma.$disconnect();
    await second.prisma.$disconnect();
  });

  const seed = async () => {
    const db = first.prisma;
    const org = await db.organization.create({ data: { name: "req-id" } });
    orgs.push(org.id);
    for (const network of ["BASE_SEPOLIA", "ETHEREUM_SEPOLIA"] as const) {
      await db.wallet.create({
        data: {
          organizationId: org.id,
          label: `payer-${network}`,
          address: PAYER,
          network,
          role: "PAYER",
          verifiedAt: new Date(),
          verifiedChainId: 1,
        },
      });
    }
    const keys: ApiKeyContext[] = [];
    for (const slug of ["one", "two"]) {
      const project = await db.project.create({
        data: { organizationId: org.id, slug, name: slug },
      });
      const environment = await db.environment.create({
        data: { projectId: project.id, kind: "SANDBOX" },
      });
      const key = await db.apiKey.create({
        data: {
          organizationId: org.id,
          projectId: project.id,
          environmentId: environment.id,
          name: slug,
          prefix: "4mica_sk_test",
          last4: "0000",
          hashedKey: randomUUID(),
          scopes: ["SPEND_AUTHORIZE"],
        },
      });
      keys.push({
        id: key.id,
        orgId: org.id,
        projectId: project.id,
        environmentId: environment.id,
        environment: "SANDBOX",
        serviceAccountId: null,
        scopes: ["SPEND_AUTHORIZE"],
        listingId: null,
        agentId: null,
      });
    }
    return { orgId: org.id, keys };
  };

  const reserve = async (
    key: ApiKeyContext,
    network: "BASE_SEPOLIA" | "ETHEREUM_SEPOLIA",
    assetAddress: string | null,
    reqId: string | null = null,
    via: Instance = first,
  ) =>
    via.authorizeSpend({
      orgId: key.orgId,
      projectId: key.projectId,
      environment: "SANDBOX",
      apiKeyId: key.id,
      agentId: null,
      agentName: null,
      network,
      assetAddress,
      amount: "1",
      payerAddress: PAYER,
      recipientAddress: RECIPIENT,
      reqId,
    });

  it("lets exactly one of a hundred concurrent attempts per payment identity hold a reqId", async () => {
    const { orgId, keys } = await seed();
    const [one, two] = keys as [ApiKeyContext, ApiKeyContext];
    const groups = [
      { key: one, network: "BASE_SEPOLIA", asset: USDC, size: 30, label: "A" },
      { key: two, network: "BASE_SEPOLIA", asset: USDC, size: 25, label: "A" },
      { key: one, network: "BASE_SEPOLIA", asset: null, size: 20, label: "C" },
      {
        key: two,
        network: "ETHEREUM_SEPOLIA",
        asset: null,
        size: 15,
        label: "D",
      },
    ] as const;

    const reserved: { id: string; key: ApiKeyContext; label: string }[] = [];
    for (const group of groups) {
      for (let index = 0; index < group.size; index++) {
        const outcome = await reserve(group.key, group.network, group.asset);
        if (outcome.kind !== "ok" || outcome.row.status !== "RESERVED") {
          throw new Error("seed reservation failed");
        }
        reserved.push({
          id: outcome.row.id,
          key: group.key,
          label: group.label,
        });
      }
    }

    const reqId = `0x${randomUUID().replaceAll("-", "")}`;
    const owners = new Map(
      await Promise.all(
        keys.map(
          async (key) => [key.id, await first.authorizationOwner(key)] as const,
        ),
      ),
    );
    const attempts = [
      ...reserved.map(async (entry, index) => {
        const via = index % 2 === 0 ? first : second;
        const outcome = await via.consumeAuthorization(
          owners.get(entry.key.id) as Awaited<
            ReturnType<Instance["authorizationOwner"]>
          >,
          entry.id,
          reqId,
        );
        return { label: entry.label, kind: outcome.kind };
      }),
      ...Array.from({ length: 10 }, async (_, index) => {
        const outcome = await reserve(
          index % 2 === 0 ? one : two,
          "BASE_SEPOLIA",
          USDC,
          reqId,
          index % 2 === 0 ? second : first,
        );
        return { label: "A", kind: outcome.kind };
      }),
    ];
    const outcomes = await Promise.all(attempts);

    const tally = (label: string, kind: string) =>
      outcomes.filter(
        (outcome) => outcome.label === label && outcome.kind === kind,
      ).length;
    expect(tally("A", "ok")).toBe(1);
    expect(tally("A", "req_id_in_use")).toBe(64);
    expect(tally("C", "ok")).toBe(1);
    expect(tally("C", "req_id_in_use")).toBe(19);
    expect(tally("D", "ok")).toBe(1);
    expect(tally("D", "req_id_in_use")).toBe(14);

    const holders = await first.prisma.spendAuthorization.groupBy({
      by: ["network", "assetAddress"],
      where: {
        organizationId: orgId,
        reqId,
        status: { in: ["RESERVED", "PENDING_APPROVAL", "CONSUMED"] },
      },
      _count: { _all: true },
      orderBy: [{ network: "asc" }, { assetAddress: "asc" }],
    });
    expect(
      holders.map((row) => [
        row.network,
        row.assetAddress,
        (row._count as { _all: number })._all,
      ]),
    ).toEqual([
      ["BASE_SEPOLIA", USDC, 1],
      ["BASE_SEPOLIA", null, 1],
      ["ETHEREUM_SEPOLIA", null, 1],
    ]);
  }, 180_000);

  it("rejects a second live holder at the database even without the lock", async () => {
    const { orgId, keys } = await seed();
    const [one] = keys as [ApiKeyContext];
    const reqId = `0x${randomUUID().replaceAll("-", "")}`;
    const held = await reserve(one, "BASE_SEPOLIA", USDC, reqId);
    expect(held.kind).toBe("ok");
    const base = {
      organizationId: orgId,
      projectId: one.projectId,
      environment: "SANDBOX" as const,
      network: "BASE_SEPOLIA" as const,
      assetAddress: USDC,
      payerAddress: PAYER,
      recipientAddress: RECIPIENT,
      amount: "1",
      reqId,
      expiresAt: new Date(Date.now() + 60_000),
    };

    const failure = await first.prisma.spendAuthorization
      .create({ data: { ...base, status: "CONSUMED" } })
      .catch((error: unknown) => error);
    expect(first.isReqIdConflict(failure)).toBe(true);

    await expect(
      first.prisma.spendAuthorization.create({
        data: { ...base, status: "RELEASED" },
      }),
    ).resolves.toMatchObject({ reqId });
  });

  it("resolves legacy duplicates deterministically before enforcing the index", async () => {
    await inLegacySchema(first.prisma, MIGRATION, async (tx, migrate) => {
      await tx.$executeRawUnsafe(`
        INSERT INTO organizations (id, name, updated_at) VALUES ('org', 'legacy', now());
        INSERT INTO projects (id, organization_id, slug, name, updated_at)
             VALUES ('project', 'org', 'default', 'Default', now());
        INSERT INTO approval_requests
               (id, organization_id, kind, action, summary, payload, payload_hash, expires_at, updated_at)
        VALUES ('approval', 'org', 'PAYMENT', 'payment.authorize', 's', '{}', 'h', now() + interval '1 day', now());
      `);
      const row = (
        id: string,
        reqId: string,
        status: string,
        minutes: number,
        asset: string | null = USDC,
        approval: string | null = null,
      ) => `('${id}', 'org', 'project', 'SANDBOX', 'BASE_SEPOLIA', ${
        asset ? `'${asset}'` : "NULL"
      }, '${PAYER}', '${RECIPIENT}', 1, '${reqId}', '${status}',
        ${approval ? `'${approval}'` : "NULL"},
        now() + interval '1 hour', now() - interval '${minutes} minutes', now())`;
      await tx.$executeRawUnsafe(`
        INSERT INTO spend_authorizations
               (id, organization_id, project_id, environment, network, asset_address,
                payer_address, recipient_address, amount, req_id, status,
                approval_request_id, expires_at, created_at, updated_at)
        VALUES ${[
          row("r1-reserved-oldest", "r1", "RESERVED", 50),
          row("r1-consumed-keep", "r1", "CONSUMED", 40),
          row("r1-consumed-later", "r1", "CONSUMED", 30),
          row("r2-pending-keep", "r2", "PENDING_APPROVAL", 50),
          row("r2-reserved", "r2", "RESERVED", 40),
          row(
            "r2-pending-later",
            "r2",
            "PENDING_APPROVAL",
            30,
            USDC,
            "approval",
          ),
          row("r3-usdc", "r3", "CONSUMED", 20),
          row("r3-native", "r3", "CONSUMED", 20, null),
          row("r4-denied", "r4", "DENIED", 20),
          row("r4-reserved", "r4", "RESERVED", 10),
          row("r5-tie-b", "r5", "RESERVED", 5),
          row("r5-tie-a", "r5", "RESERVED", 5),
        ].join(",")}
      `);
      await tx.$executeRawUnsafe(
        `UPDATE spend_authorizations SET created_at = (SELECT created_at FROM spend_authorizations WHERE id = 'r5-tie-b') WHERE id = 'r5-tie-a'`,
      );

      await migrate();

      const rows = await tx.$queryRawUnsafe<
        { id: string; status: string; req_id_conflict: string | null }[]
      >(
        "SELECT id, status::text AS status, req_id_conflict FROM spend_authorizations ORDER BY id",
      );
      expect(
        Object.fromEntries(
          rows.map((entry) => [
            entry.id,
            `${entry.status}:${entry.req_id_conflict ?? "-"}`,
          ]),
        ),
      ).toEqual({
        "r1-consumed-keep": "CONSUMED:-",
        "r1-consumed-later": "CONSUMED:duplicate_req_id",
        "r1-reserved-oldest": "RELEASED:duplicate_req_id",
        "r2-pending-keep": "PENDING_APPROVAL:-",
        "r2-pending-later": "RELEASED:duplicate_req_id",
        "r2-reserved": "RELEASED:duplicate_req_id",
        "r3-native": "CONSUMED:-",
        "r3-usdc": "CONSUMED:-",
        "r4-denied": "DENIED:-",
        "r4-reserved": "RESERVED:-",
        "r5-tie-a": "RESERVED:-",
        "r5-tie-b": "RELEASED:duplicate_req_id",
      });
      expect(
        await tx.$queryRawUnsafe(
          "SELECT status::text AS status FROM approval_requests WHERE id = 'approval'",
        ),
      ).toEqual([{ status: "CANCELLED" }]);
      expect(
        await tx.$queryRawUnsafe<{ count: bigint }[]>(
          "SELECT COUNT(*) AS count FROM spend_authorizations",
        ),
      ).toEqual([{ count: 12n }]);

      await expect(
        tx.$executeRawUnsafe(
          "UPDATE spend_authorizations SET status = 'RESERVED' WHERE id = 'r1-reserved-oldest' AND req_id_conflict IS NULL",
        ),
      ).resolves.toBe(0);
    });
  }, 300_000);
});
