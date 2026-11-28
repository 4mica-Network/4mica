import { invalidValue, ScimError } from "./errors";

export type PatchOperation = "add" | "replace" | "remove";

export interface NormalizedOperation {
  op: PatchOperation;
  path: string | null;
  value: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

export const normalizeOperations = (body: unknown): NormalizedOperation[] => {
  if (!isRecord(body)) {
    throw new ScimError(400, "The body must be a PatchOp.", "invalidSyntax");
  }

  const operations = body.Operations ?? body.operations;
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new ScimError(
      400,
      "A PatchOp needs at least one operation.",
      "invalidSyntax",
    );
  }

  return operations.map((entry) => {
    if (!isRecord(entry)) {
      throw new ScimError(
        400,
        "Each operation must be an object.",
        "invalidSyntax",
      );
    }
    const op = typeof entry.op === "string" ? entry.op.toLowerCase() : "";
    if (op !== "add" && op !== "replace" && op !== "remove") {
      throw new ScimError(
        400,
        `Unsupported operation ${String(entry.op)}.`,
        "invalidSyntax",
      );
    }
    const path =
      typeof entry.path === "string" && entry.path.trim() !== ""
        ? entry.path.trim()
        : null;
    if (op === "remove" && path === null) {
      throw new ScimError(400, "A remove operation needs a path.", "noTarget");
    }
    return { op, path, value: entry.value };
  });
};

export const flattenValue = (
  value: unknown,
): [attribute: string, value: unknown][] => {
  if (!isRecord(value)) {
    throw invalidValue("An operation without a path needs an object value.");
  }
  const entries: [string, unknown][] = [];
  for (const [key, inner] of Object.entries(value)) {
    const attribute = key.replace(
      /^urn:ietf:params:scim:schemas:core:2\.0:(User|Group):/i,
      "",
    );
    if (
      isRecord(inner) &&
      !/^urn:/i.test(key) &&
      attribute.toLowerCase() === "name"
    ) {
      for (const [sub, subValue] of Object.entries(inner)) {
        entries.push([`name.${sub}`, subValue]);
      }
      continue;
    }
    entries.push([attribute, inner]);
  }
  return entries;
};

export const toBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true") {
      return true;
    }
    if (lower === "false") {
      return false;
    }
  }
  if (isRecord(value) && "active" in value) {
    return toBoolean(value.active);
  }
  throw invalidValue("active must be a boolean.");
};

const MEMBER_FILTER = /^members\s*\[\s*value\s+eq\s+"([^"]+)"\s*\]$/i;

export interface MemberTarget {
  all: boolean;
  ids: string[];
}

export const memberValues = (value: unknown): string[] => {
  const list = Array.isArray(value)
    ? value
    : value === undefined
      ? []
      : [value];
  return list.map((entry) => {
    if (isRecord(entry) && typeof entry.value === "string") {
      return entry.value;
    }
    if (typeof entry === "string") {
      return entry;
    }
    throw invalidValue("Each member needs a string value.");
  });
};

export const memberPath = (path: string): MemberTarget | null => {
  if (path.toLowerCase() === "members") {
    return { all: true, ids: [] };
  }
  const match = MEMBER_FILTER.exec(path);
  return match?.[1] ? { all: false, ids: [match[1]] } : null;
};
