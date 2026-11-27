import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const compare = (value: unknown, op: string, arg: unknown): boolean => {
  switch (op) {
    case "in":
      return (arg as unknown[]).includes(value);
    case "notIn":
      return !(arg as unknown[]).includes(value);
    case "not":
      return arg !== null && typeof arg === "object" && !(arg instanceof Date)
        ? !matches({ value }, { value: arg })
        : value !== arg;
    case "gt":
      return value !== null && (value as number) > (arg as number);
    case "gte":
      return value !== null && (value as number) >= (arg as number);
    case "lt":
      return value !== null && (value as number) < (arg as number);
    case "lte":
      return value !== null && (value as number) <= (arg as number);
    default:
      throw new Error(`memory-table does not support ${op}`);
  }
};

const same = (a: unknown, b: unknown): boolean =>
  a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : a === b;

export const matches = (row: Row, where: Where = {}): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) {
      return true;
    }
    if (key === "OR") {
      return (condition as Where[]).some((entry) => matches(row, entry));
    }
    if (key === "AND") {
      return (condition as Where[]).every((entry) => matches(row, entry));
    }
    const value = row[key] ?? null;
    if (
      condition !== null &&
      typeof condition === "object" &&
      !(condition instanceof Date)
    ) {
      return Object.entries(condition as Where).every(([op, arg]) =>
        compare(value, op, arg),
      );
    }
    return same(value, condition);
  });

export interface MemoryTable<T extends Row> {
  rows: T[];
  seed: (...rows: Partial<T>[]) => T[];
  findFirst: (args?: { where?: Where; orderBy?: unknown }) => Promise<T | null>;
  findUnique: (args: { where: Where }) => Promise<T | null>;
  findMany: (args?: { where?: Where; take?: number }) => Promise<T[]>;
  create: (args: { data: Partial<T> }) => Promise<T>;
  createManyAndReturn: (args: {
    data: Partial<T>[];
    skipDuplicates?: boolean;
  }) => Promise<T[]>;
  update: (args: { where: Where; data: Partial<T> }) => Promise<T>;
  updateMany: (args: {
    where?: Where;
    data: Partial<T>;
  }) => Promise<{ count: number }>;
}

export const memoryTable = <T extends Row>(
  defaults: () => Partial<T>,
  options: {
    unique?: (keyof T)[][];
    decorate?: (row: T) => T;
    order?: (a: T, b: T) => number;
  } = {},
): MemoryTable<T> => {
  const rows: T[] = [];
  const decorate = options.decorate ?? ((row: T) => row);
  const build = (data: Partial<T>): T =>
    ({
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...defaults(),
      ...data,
    }) as unknown as T;
  const clash = (row: T) =>
    (options.unique ?? []).some((fields) =>
      rows.some((other) =>
        fields.every(
          (field) =>
            row[field] !== null &&
            row[field] !== undefined &&
            same(other[field], row[field]),
        ),
      ),
    );
  const sorted = (list: T[]) =>
    options.order ? [...list].sort(options.order) : list;

  return {
    rows,
    seed: (...seeds) => {
      const built = seeds.map(build);
      rows.push(...built);
      return built;
    },
    findFirst: async (args = {}) => {
      const found = sorted(rows).find((row) => matches(row, args.where));
      return found ? decorate({ ...found }) : null;
    },
    findUnique: async ({ where }) => {
      const found = rows.find((row) => matches(row, where));
      return found ? decorate({ ...found }) : null;
    },
    findMany: async (args = {}) =>
      sorted(rows.filter((row) => matches(row, args.where)))
        .slice(0, args.take ?? Number.POSITIVE_INFINITY)
        .map((row) => decorate({ ...row })),
    create: async ({ data }) => {
      const row = build(data);
      if (clash(row)) {
        throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
      }
      rows.push(row);
      return decorate({ ...row });
    },
    createManyAndReturn: async ({ data, skipDuplicates }) => {
      const created: T[] = [];
      for (const entry of data) {
        const row = build(entry);
        if (clash(row)) {
          if (skipDuplicates) {
            continue;
          }
          throw Object.assign(new Error("Unique constraint"), {
            code: "P2002",
          });
        }
        rows.push(row);
        created.push(decorate({ ...row }));
      }
      return created;
    },
    update: async ({ where, data }) => {
      const row = rows.find((entry) => matches(entry, where));
      if (!row) {
        throw Object.assign(new Error("Record not found"), { code: "P2025" });
      }
      Object.assign(row, data, { updatedAt: new Date() });
      return decorate({ ...row });
    },
    updateMany: async ({ where, data }) => {
      const hit = rows.filter((row) => matches(row, where));
      for (const row of hit) {
        Object.assign(row, data, { updatedAt: new Date() });
      }
      return { count: hit.length };
    },
  };
};
