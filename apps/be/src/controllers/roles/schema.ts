import { OWNER_ONLY_PERMISSIONS, PERMISSIONS } from "@auth/permissions";
import { singleLine } from "@controllers/schema-primitives";
import * as v from "valibot";

export const PROJECT_ROLES = ["ADMIN", "DEVELOPER", "VIEWER"] as const;

export const GOVERNED_PERMISSIONS = [
  "members.manage",
  "finance.manage",
  "wallets.manage",
  "business.manage",
] as const;

const name = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "a name is required"),
  v.maxLength(64),
  singleLine,
);

const description = v.nullable(
  v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(280),
    singleLine,
    v.transform((value) => value || null),
  ),
);

const permissions = v.pipe(
  v.array(v.picklist(PERMISSIONS)),
  v.maxLength(PERMISSIONS.length * 2),
  v.check(
    (values) => values.every((value) => !OWNER_ONLY_PERMISSIONS.has(value)),
    "owner-only permissions cannot be granted to a custom role",
  ),
  v.transform((values) => [...new Set(values)].sort()),
);

const projectRole = v.picklist(PROJECT_ROLES);

export const CreateRoleSchema = v.object({
  name,
  description: v.optional(description, null),
  permissions,
  projectRole: v.optional(projectRole, "VIEWER"),
});

export const UpdateRoleSchema = v.pipe(
  v.object({
    name: v.optional(name),
    description: v.optional(description),
    permissions: v.optional(permissions),
    projectRole: v.optional(projectRole),
  }),
  v.check(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "nothing to update",
  ),
);

export type CreateRoleInput = v.InferOutput<typeof CreateRoleSchema>;
export type UpdateRoleInput = v.InferOutput<typeof UpdateRoleSchema>;
