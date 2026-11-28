import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

interface Relation {
  table: string;
  local: string;
  foreign: string;
  many: boolean;
}

const one = (table: string, local: string, foreign = "id"): Relation => ({
  table,
  local,
  foreign,
  many: false,
});

const many = (table: string, foreign: string, local = "id"): Relation => ({
  table,
  local,
  foreign,
  many: true,
});

const RELATIONS: Record<string, Record<string, Relation>> = {
  membership: {
    user: one("user", "userId"),
    organization: one("organization", "organizationId"),
    customRole: one("customRole", "customRoleId"),
  },
  scimToken: {
    organization: one("organization", "organizationId"),
    createdBy: one("user", "createdById"),
  },
  scimGroup: {
    organization: one("organization", "organizationId"),
    customRole: one("customRole", "customRoleId"),
    members: many("scimGroupMember", "groupId"),
  },
  scimGroupMember: {
    group: one("scimGroup", "groupId"),
    user: one("user", "userId"),
  },
  projectMembership: { project: one("project", "projectId") },
  cliSession: { user: one("user", "userId") },
  project: { members: many("projectMembership", "projectId") },
  ssoConnection: { domain: one("organizationDomain", "domainId") },
  user: {},
  organization: { defaultFor: many("user", "defaultOrganizationId") },
};

const DEFAULTS: Record<string, () => Row> = {
  user: () => ({
    email: null,
    name: "",
    username: null,
    avatarUrl: null,
    banned: false,
    locked: false,
    deletedAt: null,
    defaultOrganizationId: null,
  }),
  organization: () => ({ personal: false, deletedAt: null, handle: null }),
  membership: () => ({
    role: "DEVELOPER",
    customRoleId: null,
    source: "INVITATION",
    scimExternalId: null,
    suspendedAt: null,
  }),
  scimToken: () => ({ revokedAt: null, lastUsedAt: null, createdById: null }),
  scimGroup: () => ({
    externalId: null,
    role: null,
    customRoleId: null,
    priority: 0,
  }),
  scimGroupMember: () => ({}),
  customRole: () => ({
    deletedAt: null,
    permissions: [],
    projectRole: "VIEWER",
  }),
  projectMembership: () => ({ role: "DEVELOPER" }),
  project: () => ({ deletedAt: null }),
  cliSession: () => ({ revokedAt: null, organizationId: null }),
  organizationDomain: () => ({ verifiedAt: null }),
  auditLog: () => ({
    projectId: null,
    actorUserId: null,
    actorApiKeyId: null,
    targetType: null,
    targetId: null,
    metadata: null,
    ip: null,
  }),
  externalOperation: () => ({
    status: "PENDING",
    targetType: null,
    targetId: null,
    error: null,
    completedAt: null,
  }),
  securitySettings: () => ({}),
  governanceSettings: () => ({ approvalsRequired: 0, governedActions: [] }),
  approvalRequest: () => ({ status: "PENDING", executedAt: null }),
  ssoConnection: () => ({ active: false, enforced: false }),
};

const UNIQUE: Record<string, string[][]> = {
  user: [["clerkUserId"], ["email"]],
  membership: [["organizationId", "userId"]],
  scimGroup: [["organizationId", "displayName"]],
  scimGroupMember: [["groupId", "userId"]],
  scimToken: [["hashedToken"]],
};

const CASCADE: Record<string, { table: string; foreign: string }[]> = {
  scimGroup: [{ table: "scimGroupMember", foreign: "groupId" }],
};

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date);

const same = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : a === b;

export const createScimDb = () => {
  const tables: Record<string, Row[]> = {};
  let clock = Date.parse("2026-11-27T12:00:00Z");

  const rows = (table: string) => {
    tables[table] ??= [];
    return tables[table];
  };

  const related = (table: string, row: Row, name: string): Row[] | null => {
    const relation = RELATIONS[table]?.[name];
    if (!relation) {
      return null;
    }
    return rows(relation.table).filter((other) =>
      same(other[relation.foreign], row[relation.local]),
    );
  };

  const compare = (
    value: unknown,
    condition: Record<string, unknown>,
  ): boolean => {
    const insensitive = condition.mode === "insensitive";
    const fold = (input: unknown) =>
      insensitive && typeof input === "string" ? input.toLowerCase() : input;
    return Object.entries(condition).every(([op, arg]) => {
      switch (op) {
        case "mode":
          return true;
        case "equals":
          return same(fold(value), fold(arg));
        case "in":
          return (arg as unknown[]).some((item) => same(value, item));
        case "notIn":
          return !(arg as unknown[]).some((item) => same(value, item));
        case "not":
          return isPlain(arg) ? !compare(value, arg) : !same(value, arg);
        case "contains":
          return (
            typeof value === "string" &&
            (fold(value) as string).includes(fold(arg) as string)
          );
        case "startsWith":
          return (
            typeof value === "string" &&
            (fold(value) as string).startsWith(fold(arg) as string)
          );
        case "gt":
          return value !== null && (value as number) > (arg as number);
        case "lt":
          return value !== null && (value as number) < (arg as number);
        default:
          throw new Error(`scim-db does not support ${op}`);
      }
    });
  };

  const matches = (table: string, row: Row, where: Where = {}): boolean =>
    Object.entries(where).every(([key, condition]) => {
      if (condition === undefined) {
        return true;
      }
      if (key === "AND") {
        return (condition as Where[]).every((entry) =>
          matches(table, row, entry),
        );
      }
      if (key === "OR") {
        return (condition as Where[]).some((entry) =>
          matches(table, row, entry),
        );
      }
      const relation = RELATIONS[table]?.[key];
      if (relation) {
        const others = related(table, row, key) ?? [];
        if (relation.many) {
          const filter = condition as Where;
          if (filter.some) {
            return others.some((other) =>
              matches(relation.table, other, filter.some as Where),
            );
          }
          if (filter.none) {
            return !others.some((other) =>
              matches(relation.table, other, filter.none as Where),
            );
          }
          return true;
        }
        if (condition === null) {
          return others.length === 0;
        }
        return others.some((other) =>
          matches(relation.table, other, condition as Where),
        );
      }
      const compound = key.includes("_") && isPlain(condition);
      if (compound) {
        return matches(table, row, condition as Where);
      }
      const value = row[key] ?? null;
      return isPlain(condition)
        ? compare(value, condition)
        : same(value, condition);
    });

  const project = (table: string, row: Row, select?: Row): Row => {
    if (!select) {
      return { ...row };
    }
    const out: Row = {};
    for (const [key, spec] of Object.entries(select)) {
      if (!spec) {
        continue;
      }
      if (key === "_count") {
        const counts: Row = {};
        for (const name of Object.keys((spec as { select: Row }).select)) {
          counts[name] = (related(table, row, name) ?? []).length;
        }
        out._count = counts;
        continue;
      }
      const relation = RELATIONS[table]?.[key];
      if (relation) {
        const nested = spec === true ? undefined : (spec as Row);
        const others = (related(table, row, key) ?? []).filter((other) =>
          matches(relation.table, other, nested?.where as Where),
        );
        const shaped = others.map((other) =>
          project(relation.table, other, nested?.select as Row | undefined),
        );
        out[key] = relation.many ? shaped : (shaped[0] ?? null);
        continue;
      }
      out[key] = row[key] ?? null;
    }
    return out;
  };

  const order = (list: Row[], orderBy: unknown): Row[] => {
    const specs = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [])
      .flatMap((entry) => Object.entries(entry as Row))
      .filter(([, direction]) => typeof direction === "string");
    if (specs.length === 0) {
      return list;
    }
    return [...list].sort((a, b) => {
      for (const [key, direction] of specs) {
        const left = a[key] as number | string | Date;
        const right = b[key] as number | string | Date;
        const cmp = left < right ? -1 : left > right ? 1 : 0;
        if (cmp !== 0) {
          return direction === "desc" ? -cmp : cmp;
        }
      }
      return 0;
    });
  };

  const clash = (table: string, row: Row, except?: Row) =>
    (UNIQUE[table] ?? []).some((fields) =>
      rows(table).some(
        (other) =>
          other !== except &&
          fields.every(
            (field) =>
              row[field] !== null &&
              row[field] !== undefined &&
              same(other[field], row[field]),
          ),
      ),
    );

  const uniqueError = () =>
    Object.assign(new Error("Unique constraint"), { code: "P2002" });

  const build = (table: string, data: Row): Row => {
    clock += 1;
    return {
      id: randomUUID(),
      createdAt: new Date(clock),
      updatedAt: new Date(clock),
      ...(DEFAULTS[table]?.() ?? {}),
      ...data,
    };
  };

  const insert = (table: string, data: Row): Row => {
    const row = build(table, data);
    if (clash(table, row)) {
      throw uniqueError();
    }
    rows(table).push(row);
    return row;
  };

  const remove = (table: string, victims: Row[]) => {
    tables[table] = rows(table).filter((row) => !victims.includes(row));
    for (const victim of victims) {
      for (const { table: child, foreign } of CASCADE[table] ?? []) {
        remove(
          child,
          rows(child).filter((row) => same(row[foreign], victim.id)),
        );
      }
    }
  };

  const assign = (table: string, row: Row, data: Row) => {
    const next = { ...row, ...data };
    if (clash(table, next, row)) {
      throw uniqueError();
    }
    clock += 1;
    Object.assign(row, data, { updatedAt: new Date(clock) });
  };

  const model = (table: string) => ({
    findUnique: async (args: { where: Where; select?: Row }) => {
      const row = rows(table).find((entry) =>
        matches(table, entry, args.where),
      );
      return row ? project(table, row, args.select) : null;
    },
    findFirst: async (
      args: { where?: Where; select?: Row; orderBy?: unknown } = {},
    ) => {
      const row = order(
        rows(table).filter((entry) => matches(table, entry, args.where)),
        args.orderBy,
      )[0];
      return row ? project(table, row, args.select) : null;
    },
    findMany: async (
      args: {
        where?: Where;
        select?: Row;
        orderBy?: unknown;
        skip?: number;
        take?: number;
      } = {},
    ) =>
      order(
        rows(table).filter((entry) => matches(table, entry, args.where)),
        args.orderBy,
      )
        .slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? 1e9))
        .map((row) => project(table, row, args.select)),
    count: async (args: { where?: Where } = {}) =>
      rows(table).filter((entry) => matches(table, entry, args.where)).length,
    create: async (args: { data: Row; select?: Row }) =>
      project(table, insert(table, args.data), args.select),
    createMany: async (args: { data: Row[]; skipDuplicates?: boolean }) => {
      let count = 0;
      for (const data of args.data) {
        const row = build(table, data);
        if (clash(table, row)) {
          if (args.skipDuplicates) {
            continue;
          }
          throw uniqueError();
        }
        rows(table).push(row);
        count += 1;
      }
      return { count };
    },
    update: async (args: { where: Where; data: Row; select?: Row }) => {
      const row = rows(table).find((entry) =>
        matches(table, entry, args.where),
      );
      if (!row) {
        throw Object.assign(new Error("Record not found"), { code: "P2025" });
      }
      assign(table, row, args.data);
      return project(table, row, args.select);
    },
    updateMany: async (args: { where?: Where; data: Row }) => {
      const hit = rows(table).filter((entry) =>
        matches(table, entry, args.where),
      );
      for (const row of hit) {
        assign(table, row, args.data);
      }
      return { count: hit.length };
    },
    delete: async (args: { where: Where }) => {
      const row = rows(table).find((entry) =>
        matches(table, entry, args.where),
      );
      if (!row) {
        throw Object.assign(new Error("Record not found"), { code: "P2025" });
      }
      remove(table, [row]);
      return row;
    },
    deleteMany: async (args: { where?: Where } = {}) => {
      const hit = rows(table).filter((entry) =>
        matches(table, entry, args.where),
      );
      remove(table, hit);
      return { count: hit.length };
    },
  });

  const models = Object.fromEntries(
    Object.keys(DEFAULTS).map((table) => [table, model(table)]),
  ) as Record<string, ReturnType<typeof model>>;

  const userModel = models.user as ReturnType<typeof model> & {
    upsert: (args: {
      where: { clerkUserId: string };
      create: Row & { memberships?: unknown };
      update: Row;
      select?: Row;
    }) => Promise<Row>;
  };

  userModel.upsert = async ({ where, create, update, select }) => {
    const existing = rows("user").find(
      (row) => row.clerkUserId === where.clerkUserId,
    );
    if (existing) {
      assign("user", existing, update);
      return project("user", existing, select);
    }
    const { memberships: _memberships, ...scalars } = create;
    const user = insert("user", scalars);
    const organization = insert("organization", {
      personal: true,
      handle: scalars.username ?? null,
      name: scalars.name ?? "",
    });
    insert("membership", {
      organizationId: organization.id,
      userId: user.id,
      role: "OWNER",
      source: "CREATOR",
    });
    return project("user", user, select);
  };

  const prisma: Record<string, unknown> = {
    ...models,
    $transaction: async (input: unknown) =>
      typeof input === "function"
        ? (input as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.all(input as Promise<unknown>[]),
  };

  const seed = (table: string, ...data: Row[]) =>
    data.map((entry) => insert(table, entry));

  const reset = () => {
    for (const key of Object.keys(tables)) {
      delete tables[key];
    }
  };

  return { prisma, rows, seed, reset };
};

export const scimDb = createScimDb();
