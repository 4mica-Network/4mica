import type { OrgRole, Prisma } from "@4mica/db";
import { loadUser } from "@auth/user-store";
import type { AuditEntry } from "@controllers/audit/repository";
import { appLogger } from "@logger/index";
import { clerk } from "@services/clerk";
import { isUniqueViolation } from "@utils/prisma-errors";
import { invalidValue, notFoundError, ScimError } from "./errors";
import { groupFilterWhere, parseFilter, userFilterWhere } from "./filter";
import {
  flattenValue,
  memberPath,
  memberValues,
  type NormalizedOperation,
  normalizeOperations,
  toBoolean,
} from "./patch";
import {
  applyGroupChange,
  createGroup as createGroupRow,
  createScimMembership,
  deleteGroup as deleteGroupRow,
  deprovisionMember,
  findGroup,
  findIdentity,
  findMember,
  findMemberByEmail,
  findUser,
  type GroupChange,
  type GroupRow,
  groupMemberIds,
  groupsOfUsers,
  isVerifiedDomain,
  lastLifecycleEvent,
  listGroups as listGroupRows,
  listMembers,
  type MemberRow,
  type MembershipGrant,
  mappedGroupsOf,
  membersOfGroups,
  orgMemberIds,
  recordAudit,
  updateMember,
} from "./repository";
import {
  type GroupView,
  listResponse,
  MAX_RESULTS,
  toScimGroup,
  toScimUser,
  type UserView,
} from "./resources";
import { type GroupInput, isEmail, type UserInput } from "./schema";

export interface ScimActor {
  tokenId: string;
  orgId: string;
  ip: string;
}

const entry = (
  actor: ScimActor,
  action: string,
  targetType: "user" | "group",
  targetId: string,
  metadata: Record<string, Prisma.InputJsonValue | null> = {},
): Omit<AuditEntry, "orgId"> => ({
  action,
  targetType,
  targetId,
  actorUserId: null,
  actorApiKeyId: null,
  ip: actor.ip,
  metadata: { ...metadata, scimTokenId: actor.tokenId },
});

export interface Paging {
  startIndex: number;
  count: number;
}

export const parsePaging = (query: Record<string, unknown>): Paging => {
  const number = (raw: unknown, fallback: number) => {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === "") {
      return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw invalidValue("startIndex and count must be integers.");
    }
    return parsed;
  };
  return {
    startIndex: Math.max(1, number(query.startIndex, 1)),
    count: Math.min(MAX_RESULTS, Math.max(0, number(query.count, 100))),
  };
};

const filterOf = (query: Record<string, unknown>) => {
  const raw = Array.isArray(query.filter) ? query.filter[0] : query.filter;
  return typeof raw === "string" && raw.trim() !== "" ? parseFilter(raw) : [];
};

const excludes = (query: Record<string, unknown>, attribute: string) => {
  const raw = query.excludedAttributes;
  const value = Array.isArray(raw) ? raw.join(",") : raw;
  return (
    typeof value === "string" &&
    value
      .split(",")
      .some((item) => item.trim().toLowerCase() === attribute.toLowerCase())
  );
};

export const desiredGrant = async (
  orgId: string,
  userId: string,
): Promise<MembershipGrant> => {
  const mapped = (await mappedGroupsOf(orgId, userId))
    .map((row) => row.group)
    .filter(
      (group) =>
        (group.role !== null && group.role !== "OWNER") ||
        (group.customRoleId !== null && group.customRole?.deletedAt === null),
    )
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  const top = mapped[0];
  if (!top) {
    return { role: "VIEWER", customRoleId: null };
  }
  return top.customRoleId !== null && top.customRole?.deletedAt === null
    ? { role: "VIEWER", customRoleId: top.customRoleId }
    : { role: top.role as OrgRole, customRoleId: null };
};

export interface RoleSyncContext {
  orgId: string;
  ip: string;
  actorUserId: string | null;
  metadata: Record<string, string>;
}

const scimContext = (actor: ScimActor): RoleSyncContext => ({
  orgId: actor.orgId,
  ip: actor.ip,
  actorUserId: null,
  metadata: { scimTokenId: actor.tokenId },
});

export const syncRole = async (
  context: RoleSyncContext,
  userId: string,
): Promise<void> => {
  const member = await findMember(context.orgId, userId);
  if (!member || member.role === "OWNER") {
    return;
  }
  const grant = await desiredGrant(context.orgId, userId);
  if (
    grant.role === member.role &&
    grant.customRoleId === member.customRoleId
  ) {
    return;
  }
  await updateMember(member.id, grant);
  await recordAudit({
    orgId: context.orgId,
    actorUserId: context.actorUserId,
    actorApiKeyId: null,
    ip: context.ip,
    action: "member.role_changed",
    targetType: "user",
    targetId: userId,
    metadata: {
      from: member.role,
      to: grant.role,
      fromCustomRoleId: member.customRoleId,
      toCustomRoleId: grant.customRoleId,
      source: "SCIM",
      ...context.metadata,
    },
  });
};

export const syncRoles = async (
  context: RoleSyncContext,
  userIds: Iterable<string>,
) => {
  for (const userId of new Set(userIds)) {
    await syncRole(context, userId);
  }
};

const memberView = (
  member: MemberRow,
  groups: { id: string; displayName: string }[],
): UserView => ({
  id: member.userId,
  email: member.user.email,
  name: member.user.name || null,
  externalId: member.scimExternalId,
  active: true,
  createdAt: member.createdAt,
  updatedAt: member.updatedAt,
  groups,
});

const metadataString = (metadata: unknown, key: string): string | null => {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>)[key];
    return typeof value === "string" ? value : null;
  }
  return null;
};

type Resolved =
  | { kind: "member"; member: MemberRow }
  | { kind: "inactive"; view: UserView };

const resolveUser = async (orgId: string, id: string): Promise<Resolved> => {
  const member = await findMember(orgId, id);
  if (member) {
    return { kind: "member", member };
  }
  const last = await lastLifecycleEvent(orgId, id);
  if (last?.action !== "scim.user.deactivated") {
    throw notFoundError("User", id);
  }
  const user = await findUser(id);
  if (!user) {
    throw notFoundError("User", id);
  }
  return {
    kind: "inactive",
    view: {
      id: user.id,
      email: user.email ?? metadataString(last.metadata, "userName"),
      name: user.name || null,
      externalId: metadataString(last.metadata, "externalId"),
      active: false,
      createdAt: user.createdAt,
      updatedAt: last.createdAt,
      groups: (await groupsOfUsers(orgId, [id])).get(id) ?? [],
    },
  };
};

export const getUser = async (orgId: string, id: string) => {
  const resolved = await resolveUser(orgId, id);
  if (resolved.kind === "inactive") {
    return toScimUser(resolved.view);
  }
  const groups = await groupsOfUsers(orgId, [id]);
  return toScimUser(memberView(resolved.member, groups.get(id) ?? []));
};

export const listUsers = async (
  orgId: string,
  query: Record<string, unknown>,
) => {
  const where = userFilterWhere(filterOf(query));
  const { startIndex, count } = parsePaging(query);
  const { total, rows } = await listMembers(
    orgId,
    where,
    startIndex - 1,
    count,
  );
  const groups = await groupsOfUsers(
    orgId,
    rows.map((row) => row.userId),
  );
  return listResponse(
    rows.map((row) =>
      toScimUser(memberView(row, groups.get(row.userId) ?? [])),
    ),
    total,
    startIndex,
  );
};

const clerkFailure = (error: unknown): ScimError => {
  const status = (error as { status?: number }).status;
  const message =
    (error as { errors?: { longMessage?: string; message?: string }[] })
      .errors?.[0]?.longMessage ??
    (error as { errors?: { message?: string }[] }).errors?.[0]?.message;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return invalidValue(message ?? "The identity provider refused this user.");
  }
  appLogger.error("Clerk user provisioning failed", { error });
  return new ScimError(503, "User provisioning is unavailable. Retry shortly.");
};

const clerkUserFor = async (input: UserInput) => {
  try {
    const existing = await clerk.users.getUserList({
      emailAddress: [input.email],
    });
    const found = existing.data[0];
    if (found) {
      return found;
    }
    return await clerk.users.createUser({
      emailAddress: [input.email],
      ...(input.givenName ? { firstName: input.givenName } : {}),
      ...(input.familyName ? { lastName: input.familyName } : {}),
      skipPasswordRequirement: true,
    });
  } catch (error) {
    throw clerkFailure(error);
  }
};

const uniqueness = (email: string) =>
  new ScimError(
    409,
    `A user with userName ${email} already exists.`,
    "uniqueness",
  );

export const createUser = async (actor: ScimActor, input: UserInput) => {
  if (await findMemberByEmail(actor.orgId, input.email)) {
    throw uniqueness(input.email);
  }

  const clerkUser = await clerkUserFor(input);
  const user = await loadUser({
    clerkUserId: clerkUser.id,
    sessionId: "",
    email: input.email,
    name:
      input.name ??
      ([clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        null),
    avatarUrl: clerkUser.imageUrl || null,
  });

  if (await findMember(actor.orgId, user.id)) {
    throw uniqueness(input.email);
  }

  const metadata = {
    userName: input.email,
    externalId: input.externalId ?? null,
    clerkUserId: clerkUser.id,
  };

  if (!input.active) {
    await recordAudit({
      ...entry(actor, "scim.user.deactivated", "user", user.id, metadata),
      orgId: actor.orgId,
    });
    return getUser(actor.orgId, user.id);
  }

  const grant = await desiredGrant(actor.orgId, user.id);
  try {
    await createScimMembership(
      actor.orgId,
      user.id,
      input.externalId ?? null,
      grant,
      entry(actor, "scim.user.created", "user", user.id, {
        ...metadata,
        role: grant.role,
        customRoleId: grant.customRoleId,
      }),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw uniqueness(input.email);
    }
    throw error;
  }
  return getUser(actor.orgId, user.id);
};

const revokeManagedClerkSessions = async (
  orgId: string,
  email: string | null,
  clerkUserId: string | null,
): Promise<number> => {
  const domain = email?.split("@")[1]?.toLowerCase();
  if (!domain || !clerkUserId || !(await isVerifiedDomain(orgId, domain))) {
    return 0;
  }
  try {
    const sessions = await clerk.sessions.getSessionList({
      userId: clerkUserId,
      status: "active",
    });
    await Promise.all(
      sessions.data.map((session) => clerk.sessions.revokeSession(session.id)),
    );
    return sessions.data.length;
  } catch (error) {
    appLogger.error("Could not revoke Clerk sessions of a deprovisioned user", {
      orgId,
      clerkUserId,
      error,
    });
    return 0;
  }
};

const deprovision = async (
  actor: ScimActor,
  userId: string,
  member: MemberRow | null,
  action: "scim.user.deactivated" | "scim.user.deleted",
) => {
  if (member?.role === "OWNER") {
    throw new ScimError(
      400,
      "Owners cannot be deprovisioned through SCIM. Transfer ownership first.",
      "mutability",
    );
  }
  const user = await findIdentity(userId);
  const revokedClerkSessions = await revokeManagedClerkSessions(
    actor.orgId,
    user?.email ?? null,
    user?.clerkUserId ?? null,
  );
  await deprovisionMember(
    actor.orgId,
    userId,
    { forgetGroups: action === "scim.user.deleted" },
    entry(actor, action, "user", userId, {
      userName: user?.email ?? null,
      externalId: member?.scimExternalId ?? null,
      revokedClerkSessions,
    }),
  );
};

interface UserChanges {
  externalId?: string | null;
  active?: boolean;
  email?: string;
}

const applyUserChanges = async (
  actor: ScimActor,
  id: string,
  changes: UserChanges,
) => {
  const resolved = await resolveUser(actor.orgId, id);
  const currentEmail =
    resolved.kind === "member"
      ? resolved.member.user.email
      : resolved.view.email;

  if (
    changes.email !== undefined &&
    currentEmail !== null &&
    changes.email.toLowerCase() !== currentEmail.toLowerCase()
  ) {
    throw new ScimError(
      400,
      "userName cannot be changed. Deprovision the user and provision the new address.",
      "mutability",
    );
  }

  if (resolved.kind === "member") {
    const { member } = resolved;
    if (changes.active === false) {
      await deprovision(actor, id, member, "scim.user.deactivated");
      return getUser(actor.orgId, id);
    }
    if (
      changes.externalId !== undefined &&
      changes.externalId !== member.scimExternalId
    ) {
      await updateMember(member.id, { scimExternalId: changes.externalId });
      await recordAudit({
        ...entry(actor, "scim.user.updated", "user", id, {
          externalId: changes.externalId,
        }),
        orgId: actor.orgId,
      });
    }
    return getUser(actor.orgId, id);
  }

  if (changes.active === true) {
    const grant = await desiredGrant(actor.orgId, id);
    const externalId =
      changes.externalId === undefined
        ? resolved.view.externalId
        : changes.externalId;
    try {
      await createScimMembership(
        actor.orgId,
        id,
        externalId,
        grant,
        entry(actor, "scim.user.reactivated", "user", id, {
          userName: resolved.view.email,
          externalId,
          role: grant.role,
          customRoleId: grant.customRoleId,
        }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }
  return getUser(actor.orgId, id);
};

export const replaceUser = (actor: ScimActor, id: string, input: UserInput) =>
  applyUserChanges(actor, id, {
    email: input.email,
    active: input.active,
    externalId: input.externalId ?? null,
  });

const userAttribute = (
  changes: UserChanges,
  op: NormalizedOperation["op"],
  attribute: string,
  value: unknown,
) => {
  const lower = attribute.toLowerCase();
  if (lower === "active") {
    changes.active = op === "remove" ? false : toBoolean(value);
    return;
  }
  if (lower === "externalid") {
    changes.externalId =
      op === "remove" || value === null
        ? null
        : typeof value === "string"
          ? value.trim()
          : (() => {
              throw invalidValue("externalId must be a string.");
            })();
    return;
  }
  if (lower === "username" && op !== "remove") {
    if (typeof value !== "string" || !isEmail(value.trim())) {
      throw invalidValue("userName must be an email address.");
    }
    changes.email = value.trim();
  }
};

export const patchUser = (actor: ScimActor, id: string, body: unknown) => {
  const changes: UserChanges = {};
  for (const operation of normalizeOperations(body)) {
    if (operation.path === null) {
      for (const [attribute, value] of flattenValue(operation.value)) {
        userAttribute(changes, operation.op, attribute, value);
      }
      continue;
    }
    userAttribute(
      changes,
      operation.op,
      operation.path.replace(
        /^urn:ietf:params:scim:schemas:core:2\.0:User:/i,
        "",
      ),
      operation.value,
    );
  }
  return applyUserChanges(actor, id, changes);
};

export const deleteUser = async (actor: ScimActor, id: string) => {
  const resolved = await resolveUser(actor.orgId, id);
  await deprovision(
    actor,
    id,
    resolved.kind === "member" ? resolved.member : null,
    "scim.user.deleted",
  );
};

const groupView = (
  row: GroupRow,
  members: { id: string; display: string | null }[] | null,
): GroupView => ({
  id: row.id,
  displayName: row.displayName,
  externalId: row.externalId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  members,
});

export const getGroup = async (
  orgId: string,
  id: string,
  query: Record<string, unknown> = {},
) => {
  const row = await findGroup(orgId, id);
  if (!row) {
    throw notFoundError("Group", id);
  }
  const members = excludes(query, "members")
    ? null
    : ((await membersOfGroups([id])).get(id) ?? []);
  return toScimGroup(groupView(row, members));
};

export const listGroups = async (
  orgId: string,
  query: Record<string, unknown>,
) => {
  const where = groupFilterWhere(filterOf(query));
  const { startIndex, count } = parsePaging(query);
  const { total, rows } = await listGroupRows(
    orgId,
    where,
    startIndex - 1,
    count,
  );
  const members = excludes(query, "members")
    ? null
    : await membersOfGroups(rows.map((row) => row.id));
  return listResponse(
    rows.map((row) =>
      toScimGroup(groupView(row, members ? (members.get(row.id) ?? []) : null)),
    ),
    total,
    startIndex,
  );
};

const groupTaken = (displayName: string) =>
  new ScimError(
    409,
    `A group named ${displayName} already exists.`,
    "uniqueness",
  );

const syncAll = (actor: ScimActor, userIds: Iterable<string>) =>
  syncRoles(scimContext(actor), userIds);

export const createGroup = async (actor: ScimActor, input: GroupInput) => {
  const memberIds = await orgMemberIds(actor.orgId, [
    ...new Set(input.members),
  ]);
  let created: GroupRow;
  try {
    created = await createGroupRow(
      actor.orgId,
      { displayName: input.displayName, externalId: input.externalId ?? null },
      memberIds,
      {
        ...entry(actor, "scim.group.created", "group", "", {
          displayName: input.displayName,
          externalId: input.externalId ?? null,
          members: memberIds,
        }),
      },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw groupTaken(input.displayName);
    }
    throw error;
  }
  await syncAll(actor, memberIds);
  return getGroup(actor.orgId, created.id);
};

const changeGroup = async (
  actor: ScimActor,
  id: string,
  change: GroupChange,
) => {
  const group = await findGroup(actor.orgId, id);
  if (!group) {
    throw notFoundError("Group", id);
  }
  const allowed = new Set(
    await orgMemberIds(actor.orgId, [
      ...new Set([...change.add, ...(change.replaceMembers ?? [])]),
    ]),
  );
  const scoped: GroupChange = {
    ...change,
    add: change.add.filter((userId) => allowed.has(userId)),
    replaceMembers:
      change.replaceMembers === null
        ? null
        : change.replaceMembers.filter((userId) => allowed.has(userId)),
  };

  const before = new Set(await groupMemberIds(id));
  try {
    await applyGroupChange(id, scoped, {
      ...entry(actor, "scim.group.updated", "group", id, {
        displayName: scoped.displayName ?? group.displayName,
        added: scoped.add,
        removed: scoped.remove,
        replacedMembers: scoped.replaceMembers,
      }),
      orgId: actor.orgId,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw groupTaken(scoped.displayName ?? group.displayName);
    }
    throw error;
  }
  const after = new Set(await groupMemberIds(id));
  await syncAll(actor, [
    ...[...before].filter((userId) => !after.has(userId)),
    ...[...after].filter((userId) => !before.has(userId)),
  ]);
};

export const replaceGroup = async (
  actor: ScimActor,
  id: string,
  input: GroupInput,
) => {
  await changeGroup(actor, id, {
    displayName: input.displayName,
    externalId: input.externalId ?? null,
    add: [],
    remove: [],
    replaceMembers: [...new Set(input.members)],
  });
  return getGroup(actor.orgId, id);
};

const IGNORED_GROUP_ATTRIBUTES: ReadonlySet<string> = new Set([
  "id",
  "schemas",
  "meta",
]);

const groupOperation = (
  change: GroupChange,
  operation: NormalizedOperation,
) => {
  if (operation.path === null) {
    for (const [attribute, value] of flattenValue(operation.value)) {
      if (!IGNORED_GROUP_ATTRIBUTES.has(attribute.toLowerCase())) {
        groupOperation(change, { op: operation.op, path: attribute, value });
      }
    }
    return;
  }

  const path = operation.path.replace(
    /^urn:ietf:params:scim:schemas:core:2\.0:Group:/i,
    "",
  );
  const lower = path.toLowerCase();

  if (lower === "displayname") {
    if (operation.op === "remove") {
      throw new ScimError(400, "displayName is required.", "mutability");
    }
    if (typeof operation.value !== "string" || operation.value.trim() === "") {
      throw invalidValue("displayName must be a non-empty string.");
    }
    change.displayName = operation.value.trim();
    return;
  }

  if (lower === "externalid") {
    change.externalId =
      operation.op === "remove" || operation.value === null
        ? null
        : String(operation.value);
    return;
  }

  const target = memberPath(path);
  if (!target) {
    throw new ScimError(400, `Unsupported path ${path}.`, "invalidPath");
  }

  if (operation.op === "remove") {
    if (!target.all) {
      change.remove.push(...target.ids);
      return;
    }
    const ids = memberValues(operation.value);
    if (ids.length === 0) {
      change.replaceMembers = [];
      change.add = [];
      return;
    }
    change.remove.push(...ids);
    change.add = change.add.filter((id) => !ids.includes(id));
    return;
  }

  const ids = target.all ? memberValues(operation.value) : target.ids;
  if (operation.op === "replace" && target.all) {
    change.replaceMembers = ids;
    change.add = [];
    change.remove = [];
    return;
  }
  change.add.push(...ids);
  change.remove = change.remove.filter((id) => !ids.includes(id));
};

export const patchGroup = async (
  actor: ScimActor,
  id: string,
  body: unknown,
) => {
  const change: GroupChange = { add: [], remove: [], replaceMembers: null };
  for (const operation of normalizeOperations(body)) {
    groupOperation(change, operation);
  }
  await changeGroup(actor, id, change);
  return getGroup(actor.orgId, id);
};

export const deleteGroup = async (actor: ScimActor, id: string) => {
  const group = await findGroup(actor.orgId, id);
  if (!group) {
    throw notFoundError("Group", id);
  }
  const members = await groupMemberIds(id);
  await deleteGroupRow(id, {
    ...entry(actor, "scim.group.deleted", "group", id, {
      displayName: group.displayName,
      members,
    }),
    orgId: actor.orgId,
  });
  await syncAll(actor, members);
};
