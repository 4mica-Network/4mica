import type { OrgRole } from "@4mica/db";
import { vi } from "vitest";
import { membershipRow } from "./tenancy";

type Row = Record<string, unknown>;

export const ORG = "019fce62-0000-7000-8000-0000000000a1";

export const createIdentityDb = () => {
  const isPlain = (value: unknown): value is Row =>
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Date) &&
    !Array.isArray(value);

  const same = (a: unknown, b: unknown) =>
    a instanceof Date && b instanceof Date
      ? a.getTime() === b.getTime()
      : a === b;

  const OPS = new Set(["in", "not"]);

  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (cond === undefined) {
        return true;
      }
      const value = row[key] ?? null;
      if (isPlain(cond)) {
        const ops = Object.keys(cond);
        if (ops.length > 0 && ops.every((op) => OPS.has(op))) {
          return ops.every((op) =>
            op === "in"
              ? (cond.in as unknown[]).includes(value)
              : !same(value, cond.not),
          );
        }
        return isPlain(value) && matches(value, cond);
      }
      return same(value, cond);
    });

  const tables = {
    organizationDomain: [] as Row[],
    ssoConnection: [] as Row[],
    memberships: [] as Row[],
    auditLogs: [] as Row[],
    externalOperations: [] as Row[],
  };

  let seq = 0;
  const id = () => `019fce62-0000-7000-8000-${String(++seq).padStart(12, "0")}`;

  const withRelations = (name: "organizationDomain" | "ssoConnection") =>
    name === "organizationDomain"
      ? (row: Row) => ({
          ...row,
          organization: {
            deletedAt: null,
            personal: row.organizationId === "personal",
          },
        })
      : (row: Row) => ({
          ...row,
          organization: { deletedAt: null, personal: false },
          domain: tables.organizationDomain.find((d) => d.id === row.domainId),
        });

  const table = (name: "organizationDomain" | "ssoConnection") => {
    const view = () => tables[name].map(withRelations(name));
    return {
      findMany: vi.fn(async ({ where }: { where?: Row } = {}) =>
        view().filter((row) => matches(row, where)),
      ),
      findFirst: vi.fn(
        async ({ where }: { where?: Row } = {}) =>
          view().find((row) => matches(row, where)) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        if (
          name === "organizationDomain" &&
          tables[name].some(
            (row) =>
              row.organizationId === data.organizationId &&
              row.domain === data.domain,
          )
        ) {
          throw Object.assign(new Error("Unique"), { code: "P2002" });
        }
        const row: Row = {
          id: id(),
          createdAt: new Date(),
          verifiedAt: null,
          lastCheckedAt: null,
          autoJoin: false,
          autoJoinRole: "VIEWER",
          active: false,
          enforced: false,
          ...data,
        };
        tables[name].push(row);
        return withRelations(name)(row);
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Row }) => {
          const row = tables[name].find((r) => r.id === where.id);
          if (!row) {
            throw new Error("not found");
          }
          Object.assign(row, data);
          return withRelations(name)(row);
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: Row }) => {
        const before = tables[name].length;
        tables[name] = tables[name].filter((row) => !matches(row, where));
        return { count: before - tables[name].length };
      }),
    };
  };

  const db = {
    organizationDomain: table("organizationDomain"),
    ssoConnection: table("ssoConnection"),
    membership: {
      findFirst: vi.fn(),
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        tables.memberships.filter((row) => matches(row, where)),
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        if (
          tables.memberships.some(
            (row) =>
              row.organizationId === data.organizationId &&
              row.userId === data.userId,
          )
        ) {
          throw Object.assign(new Error("Unique"), { code: "P2002" });
        }
        tables.memberships.push(data);
        return data;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        tables.auditLogs.push(data);
        return { id: "audit" };
      }),
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        tables.auditLogs.filter((row) => matches(row, where)),
      ),
    },
    externalOperation: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row: Row = { id: id(), status: "PENDING", ...data };
        tables.externalOperations.push(row);
        return { id: row.id };
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Row }) => {
          const row = tables.externalOperations.find((r) => r.id === where.id);
          if (!row) {
            throw new Error("not found");
          }
          Object.assign(row, data);
          return { id: row.id };
        },
      ),
    },
    securitySettings: { findUnique: vi.fn(async () => null) },
    governanceSettings: { findUnique: vi.fn() },
    approvalRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: Row }) =>
        "clerkUserId" in where ? null : { defaultOrganizationId: null },
      ),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const fake = {
    reset: () => {
      tables.organizationDomain = [];
      tables.ssoConnection = [];
      tables.memberships = [];
      tables.auditLogs = [];
      tables.externalOperations = [];
    },
    domain: (over: Row = {}) => {
      const row: Row = {
        id: id(),
        organizationId: "019fce62-0000-7000-8000-0000000000a1",
        domain: "acme.com",
        verificationToken: "tok123",
        verifiedAt: null,
        lastCheckedAt: null,
        autoJoin: false,
        autoJoinRole: "VIEWER",
        createdAt: new Date("2026-11-01T00:00:00Z"),
        ...over,
      };
      tables.organizationDomain.push(row);
      return row;
    },
    connection: (over: Row = {}) => {
      const row: Row = {
        id: id(),
        organizationId: "019fce62-0000-7000-8000-0000000000a1",
        provider: "OKTA",
        name: "Okta",
        clerkConnectionId: "samlc_1",
        idpEntityId: null,
        idpSsoUrl: null,
        idpMetadataUrl: "https://idp.example.com/metadata",
        active: true,
        enforced: false,
        jitProvisioning: true,
        defaultRole: "DEVELOPER",
        createdAt: new Date("2026-11-01T00:00:00Z"),
        ...over,
      };
      tables.ssoConnection.push(row);
      return row;
    },
  };

  return { db, tables, fake, matches };
};

export type IdentityDb = ReturnType<typeof createIdentityDb>;

export const USER_ID = "019fce62-0000-7000-8000-0000000000f0";

export const HEADERS = {
  authorization: "Bearer good",
  "x-org-id": ORG,
};

export const signedIn = (fva: [number, number] = [1, -1]) => ({
  isAuthenticated: true,
  status: "signed-in",
  reason: null,
  toAuth: () => ({
    tokenType: "session_token",
    userId: "user_123",
    sessionId: "sess_123",
    sessionClaims: {
      sub: "user_123",
      sid: "sess_123",
      email: "ada@acme.com",
      fva,
    },
  }),
});

export const clerkUser = (over: Row = {}) => ({
  id: "user_123",
  primaryEmailAddressId: "idn_1",
  emailAddresses: [
    {
      id: "idn_1",
      emailAddress: "ada@acme.com",
      verification: { status: "verified" },
    },
  ],
  samlAccounts: [],
  ...over,
});

export const actInOrg = (
  db: IdentityDb["db"],
  role: OrgRole = "OWNER",
  personal = false,
) => {
  db.membership.findFirst.mockReset();
  db.membership.findFirst.mockImplementation(
    async ({ where }: { where: { organization?: { id?: string } } }) => {
      const requested = where.organization?.id;
      return requested === undefined || requested === ORG
        ? { ...membershipRow(role, ORG, personal), suspendedAt: null }
        : null;
    },
  );
};

export const resetIdentity = ({ db, fake }: IdentityDb) => {
  fake.reset();
  db.membership.create.mockClear();
  db.user.upsert.mockResolvedValue({
    id: USER_ID,
    clerkUserId: "user_123",
    email: "ada@acme.com",
    name: "Ada",
    avatarUrl: null,
    banned: false,
    locked: false,
    deletedAt: null,
  });
  db.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(db)
      : Promise.all(arg as Promise<unknown>[]),
  );
  actInOrg(db);
};
