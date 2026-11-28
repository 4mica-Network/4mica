import { randomUUID } from "node:crypto";
import type { ApiKeyContext } from "@auth/api-key";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inLegacySchema } from "@/test-support/legacy-schema";

const url = process.env.INTEGRATION_DATABASE_URL;

const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const PAYER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";
const MIGRATION = "20261202122000_record_spend_authorization_issuer";

type Db = typeof import("@4mica/db");
type Decide = typeof import("./decide");
type Repository = typeof import("./repository");

describe.skipIf(!url)("authorization issuer history on real Postgres", () => {
  let db: Db["prisma"];
  let decide: Decide;
  let repository: Repository;
  const orgs: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = (await import("@4mica/db")).prisma;
    decide = await import("./decide");
    repository = await import("./repository");
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

  it("keeps a service account's authorization usable after its issuing key is deleted", async () => {
    const org = await db.organization.create({ data: { name: "issuer" } });
    orgs.push(org.id);
    const project = await db.project.create({
      data: { organizationId: org.id, slug: "default", name: "Default" },
    });
    const environment = await db.environment.create({
      data: { projectId: project.id, kind: "SANDBOX" },
    });
    const account = await db.serviceAccount.create({
      data: { organizationId: org.id, projectId: project.id, name: "ci" },
    });
    const keyFor = async (name: string): Promise<ApiKeyContext> => {
      const key = await db.apiKey.create({
        data: {
          organizationId: org.id,
          projectId: project.id,
          environmentId: environment.id,
          serviceAccountId: account.id,
          name,
          prefix: `4mica_sk_${name}`,
          last4: "0000",
          hashedKey: randomUUID(),
          scopes: ["SPEND_AUTHORIZE"],
        },
      });
      return {
        id: key.id,
        orgId: org.id,
        projectId: project.id,
        environmentId: environment.id,
        environment: "SANDBOX",
        serviceAccountId: account.id,
        prefix: key.prefix,
        scopes: ["SPEND_AUTHORIZE"],
        listingId: null,
        agentId: null,
      };
    };
    const original = await keyFor("original");
    const outcome = await decide.authorizeSpend({
      orgId: org.id,
      projectId: project.id,
      environment: "SANDBOX",
      apiKeyId: original.id,
      apiKeyPrefix: original.prefix,
      serviceAccountId: account.id,
      agentId: null,
      agentName: null,
      network: "BASE_SEPOLIA",
      assetAddress: USDC,
      amount: "1",
      payerAddress: PAYER,
      recipientAddress: RECIPIENT,
      reqId: null,
    });
    if (outcome.kind !== "ok") {
      throw new Error("authorization failed");
    }

    const rotated = await keyFor("rotated");
    await db.apiKey.delete({ where: { id: original.id } });

    const stored = await db.spendAuthorization.findUniqueOrThrow({
      where: { id: outcome.row.id },
    });
    expect(stored).toMatchObject({
      apiKeyId: null,
      issuedByKeyId: original.id,
      issuedByKeyPrefix: "4mica_sk_original",
      serviceAccountId: account.id,
    });

    const owner = repository.authorizationOwner(rotated);
    expect((await decide.refreshAuthorization(owner, outcome.row.id))?.id).toBe(
      outcome.row.id,
    );
    const released = await decide.releaseAuthorization(owner, outcome.row.id);
    expect(released.kind).toBe("ok");

    const stranger = repository.authorizationOwner({
      ...rotated,
      id: randomUUID(),
      serviceAccountId: null,
    });
    expect(
      await decide.refreshAuthorization(stranger, outcome.row.id),
    ).toBeNull();
  });

  it("backfills the issuer from the key, the approval request or the audit trail", async () => {
    await inLegacySchema(db, MIGRATION, async (tx, migrate) => {
      await tx.$executeRawUnsafe(`
        INSERT INTO organizations (id, name, updated_at) VALUES ('org', 'legacy', now());
        INSERT INTO projects (id, organization_id, slug, name, updated_at)
             VALUES ('project', 'org', 'default', 'Default', now());
        INSERT INTO environments (id, project_id, kind) VALUES ('env', 'project', 'SANDBOX');
        INSERT INTO service_accounts (id, organization_id, project_id, name, updated_at)
             VALUES ('account', 'org', 'project', 'ci', now());
        INSERT INTO api_keys (id, organization_id, project_id, environment_id, service_account_id,
                              name, prefix, last4, hashed_key, updated_at)
             VALUES ('live-key', 'org', 'project', 'env', 'account', 'k', '4mica_sk_live', '0000', 'hash', now());
        INSERT INTO approval_requests
               (id, organization_id, kind, action, summary, payload, payload_hash,
                requested_by_api_key_id, expires_at, updated_at)
        VALUES ('approval', 'org', 'PAYMENT', 'payment.authorize', 's', '{}', 'h', 'approval-key', now(), now());
        INSERT INTO audit_logs (id, organization_id, actor_api_key_id, action, target_type, target_id)
        VALUES ('log', 'org', 'audit-key', 'spend.denied', 'spend_authorization', 'from-audit');
      `);
      const row = (
        id: string,
        key: string | null,
        approval: string | null = null,
      ) => `('${id}', 'org', 'project', 'SANDBOX', ${key ? `'${key}'` : "NULL"},
        'BASE_SEPOLIA', '${USDC}', '${PAYER}', '${RECIPIENT}', 1, 'DENIED',
        ${approval ? `'${approval}'` : "NULL"}, now(), now())`;
      await tx.$executeRawUnsafe(`
        INSERT INTO spend_authorizations
               (id, organization_id, project_id, environment, api_key_id, network,
                asset_address, payer_address, recipient_address, amount, status,
                approval_request_id, expires_at, updated_at)
        VALUES ${[
          row("from-key", "live-key"),
          row("from-approval", null, "approval"),
          row("from-audit", null),
          row("unknown", null),
        ].join(",")}
      `);

      await migrate();

      expect(
        await tx.$queryRawUnsafe(
          "SELECT id, issued_by_key_id, issued_by_key_prefix, service_account_id FROM spend_authorizations ORDER BY id",
        ),
      ).toEqual([
        {
          id: "from-approval",
          issued_by_key_id: "approval-key",
          issued_by_key_prefix: null,
          service_account_id: null,
        },
        {
          id: "from-audit",
          issued_by_key_id: "audit-key",
          issued_by_key_prefix: null,
          service_account_id: null,
        },
        {
          id: "from-key",
          issued_by_key_id: "live-key",
          issued_by_key_prefix: "4mica_sk_live",
          service_account_id: "account",
        },
        {
          id: "unknown",
          issued_by_key_id: null,
          issued_by_key_prefix: null,
          service_account_id: null,
        },
      ]);

      await tx.$executeRawUnsafe("DELETE FROM api_keys WHERE id = 'live-key'");
      expect(
        await tx.$queryRawUnsafe(
          "SELECT api_key_id, issued_by_key_id, service_account_id FROM spend_authorizations WHERE id = 'from-key'",
        ),
      ).toEqual([
        {
          api_key_id: null,
          issued_by_key_id: "live-key",
          service_account_id: "account",
        },
      ]);
    });
  }, 300_000);
});
