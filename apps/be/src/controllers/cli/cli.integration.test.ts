import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.INTEGRATION_DATABASE_URL;

type Db = typeof import("@4mica/db");
type Repository = typeof import("./repository");
type AuthRepository = typeof import("@auth/repository");
type Secrets = typeof import("@utils/secrets");

describe.skipIf(!url)("CLI SSO provenance on real Postgres", () => {
  let db: Db["prisma"];
  let repo: Repository;
  let findCliSessionByHash: AuthRepository["findCliSessionByHash"];
  let hashSecret: Secrets["hashSecret"];
  const users: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = (await import("@4mica/db")).prisma;
    repo = await import("./repository");
    findCliSessionByHash = (await import("@auth/repository"))
      .findCliSessionByHash;
    hashSecret = (await import("@utils/secrets")).hashSecret;
  });

  afterAll(async () => {
    if (!db) {
      return;
    }
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });

  const seedUser = async () => {
    const user = await db.user.create({
      data: { clerkUserId: `user_${randomUUID()}` },
    });
    users.push(user.id);
    return user.id;
  };

  const deviceSession = async (
    userId: string,
    clerkSsoConnectionId: string | null,
  ) => {
    const created = await repo.createDeviceRequest({
      clientName: "laptop",
      requestIp: "127.0.0.1",
      scopes: ["account:read"],
      organizationId: null,
    });
    await repo.decideDeviceRequest(userId, created.userCode, "APPROVED", {
      organizationId: null,
      mfaVerified: true,
      clerkSsoConnectionId,
    });
    const found = await repo.findDeviceRequestByCode(created.deviceCode);
    expect(found?.clerkSsoConnectionId).toBe(clerkSsoConnectionId);
    const redeemed = await repo.redeemDeviceRequest({
      id: found?.id as string,
      userId,
      clientName: "laptop",
      scopes: ["account:read"],
      organizationId: null,
      mfaVerified: true,
      clerkSsoConnectionId: found?.clerkSsoConnectionId ?? null,
    });
    return redeemed?.plaintext as string;
  };

  it("carries the approving session's SSO connection into the CLI session", async () => {
    const userId = await seedUser();
    const token = await deviceSession(userId, "samlc_live");
    const record = await findCliSessionByHash(hashSecret(token));
    expect(record?.clerkSsoConnectionId).toBe("samlc_live");
  });

  it("leaves sessions approved without SSO with no provenance", async () => {
    const userId = await seedUser();
    const token = await deviceSession(userId, null);
    const record = await findCliSessionByHash(hashSecret(token));
    expect(record?.clerkSsoConnectionId).toBeNull();
  });

  it("records provenance on CI tokens", async () => {
    const userId = await seedUser();
    const { plaintext } = await repo.createCliToken(userId, {
      name: "ci",
      scopes: ["account:read"],
      expiresInDays: 1,
      organizationId: null,
      mfaVerified: false,
      clerkSsoConnectionId: "samlc_ci",
    });
    const record = await findCliSessionByHash(hashSecret(plaintext));
    expect(record?.clerkSsoConnectionId).toBe("samlc_ci");
  });
});
