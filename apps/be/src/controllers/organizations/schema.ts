import {
  isValidUsername,
  USERNAME_MESSAGE,
  usernameUnavailableReason,
} from "@4mica/url";
import { isoInstant } from "@controllers/finance/schema";
import { email, singleLine } from "@controllers/schema-primitives";
import * as v from "valibot";

export const ORG_ROLES = [
  "OWNER",
  "ADMIN",
  "DEVELOPER",
  "VIEWER",
  "FINANCE",
] as const;
export const MEMBERSHIP_SOURCES = [
  "INVITATION",
  "CREATOR",
  "SCIM",
  "DOMAIN",
] as const;
export const GOVERNED_ROLES: readonly OrgRoleInput[] = [
  "OWNER",
  "ADMIN",
  "FINANCE",
];
export const MAX_INVITES_PER_REQUEST = 20;
export const INVITATION_TTL_DAYS = 7;
export const AUDIT_PAGE_MAX = 100;
export const AUDIT_PAGE_DEFAULT = 50;

const RoleSchema = v.picklist(ORG_ROLES);

const handle = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.check(isValidUsername, USERNAME_MESSAGE),
  v.check(
    (value) => usernameUnavailableReason(value) === null,
    "that handle is not available",
  ),
);

const name = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "a name is required"),
  v.maxLength(120),
  singleLine,
);

export const CreateOrganizationSchema = v.object({ name, handle });

export const UpdateOrganizationSchema = v.pipe(
  v.object({ name: v.optional(name), handle: v.optional(handle) }),
  v.check(
    (value) => value.name !== undefined || value.handle !== undefined,
    "nothing to update",
  ),
);

export const UpdateMemberSchema = v.pipe(
  v.object({
    role: v.optional(RoleSchema),
    customRoleId: v.optional(
      v.pipe(v.string(), v.trim(), v.toLowerCase(), v.uuid()),
    ),
  }),
  v.check(
    (value) =>
      (value.role === undefined) !== (value.customRoleId === undefined),
    "set either role or customRoleId",
  ),
);

export const TransferOwnershipSchema = v.object({
  userId: v.pipe(v.string(), v.uuid()),
});

export const InviteMembersSchema = v.object({
  emails: v.pipe(
    v.array(email(255)),
    v.minLength(1, "add at least one email address"),
    v.maxLength(MAX_INVITES_PER_REQUEST),
    v.transform((values) => [...new Set(values)]),
  ),
  role: v.optional(RoleSchema, "DEVELOPER"),
});

const auditText = (max: number) =>
  v.optional(v.pipe(v.string(), v.trim(), v.maxLength(max)));

const auditId = v.optional(
  v.pipe(v.string(), v.trim(), v.toLowerCase(), v.uuid()),
);

const AuditLogFilterEntries = {
  from: v.optional(isoInstant),
  to: v.optional(isoInstant),
  action: auditText(64),
  actionPrefix: auditText(64),
  actorUserId: auditId,
  actorApiKeyId: auditId,
  targetType: auditText(64),
  targetId: auditText(64),
  projectId: auditId,
  q: auditText(100),
};

export const ListAuditLogsQuerySchema = v.object({
  limit: v.optional(
    v.pipe(
      v.union([v.number(), v.string()]),
      v.transform(Number),
      v.integer(),
      v.minValue(1),
      v.maxValue(AUDIT_PAGE_MAX),
    ),
    AUDIT_PAGE_DEFAULT,
  ),
  cursor: v.optional(v.pipe(v.string(), v.uuid())),
  ...AuditLogFilterEntries,
});

export const ExportAuditLogsQuerySchema = v.object(AuditLogFilterEntries);

export type AuditLogFilterQuery = v.InferOutput<
  typeof ExportAuditLogsQuerySchema
>;

export type OrgRoleInput = v.InferOutput<typeof RoleSchema>;
