import type { EnvironmentKind, OrgRole, ProjectRole } from "@4mica/db";
import { slugify } from "@4mica/rules";
import {
  effectiveProjectRole,
  type ProjectPermission,
  projectPermissionsFor,
} from "@auth/permissions";
import type { ProjectScope } from "@auth/project";
import {
  invalidBody,
  notFound,
  parseBody,
  requireProject,
  requireTenant,
} from "@controllers/shared";
import { isUniqueViolation } from "@utils/prisma-errors";
import { nextFreeSlug } from "@utils/slug";
import type { FastifyReply, FastifyRequest, RouteHandler } from "fastify";
import {
  createProject,
  environmentOf,
  findOrgMember,
  getProject,
  listOrgMembersWithProjectRole,
  listProjects,
  moveResources,
  type ProjectMemberRow,
  type ProjectRow,
  projectHasResources,
  projectSlugTaken,
  removeProjectMember,
  setProjectMember,
  softDeleteProject,
  takenProjectSlugs,
  updateProject,
} from "./repository";
import {
  CreateProjectSchema,
  MoveResourcesSchema,
  SetProjectMemberSchema,
  UpdateProjectSchema,
} from "./schema";

const ENVIRONMENTS: readonly EnvironmentKind[] = ["SANDBOX", "PRODUCTION"];

const roleOn = (
  row: ProjectRow,
  orgRole: OrgRole,
  customProjectRole: ProjectRole | null = null,
): ProjectRole | null =>
  effectiveProjectRole({
    orgRole,
    customProjectRole,
    projectRole: row.members[0]?.role ?? null,
    restricted: row.restricted,
  });

const permissionsOn = (
  row: ProjectRow,
  role: ProjectRole,
  environment: EnvironmentKind,
): ProjectPermission[] =>
  projectPermissionsFor({
    role,
    environment,
    restrictProduction: row.restrictProduction,
    archived: row.archivedAt !== null,
  });

const summary = (row: ProjectRow, role: ProjectRole) => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  isDefault: row.isDefault,
  restricted: row.restricted,
  restrictProduction: row.restrictProduction,
  archived: row.archivedAt !== null,
  role,
  permissions: Object.fromEntries(
    ENVIRONMENTS.map((env) => [env, permissionsOn(row, role, env)]),
  ),
  environments: row.environments,
  createdAt: row.createdAt,
});

const actor = (request: FastifyRequest, userId: string) => ({
  actorUserId: userId,
  ip: request.ip,
});

const slugTaken = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "slug_taken",
    message: "This organization already has a project at that address.",
    issues: [{ path: "slug", message: "is already in use" }],
  });

const defaultProject = (reply: FastifyReply, message: string) =>
  reply.code(400).send({ error: "default_project", message });

const activeSummary = async (reply: FastifyReply, scope: ProjectScope) => {
  const row = await getProject(scope.orgId, scope.userId, scope.projectId);
  if (!row) {
    return notFound(reply, "project");
  }
  return reply.send(summary(row, scope.role));
};

export const listProjectsHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "resources.read");
  if (!tenant) {
    return reply;
  }

  const rows = await listProjects(tenant.orgId, tenant.userId);
  const items = rows.flatMap((row) => {
    const role = roleOn(row, tenant.role, tenant.custom?.projectRole ?? null);
    return role ? [summary(row, role)] : [];
  });

  return reply.send({ items });
};

export const createProjectHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "projects.create");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(CreateProjectSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { name, description, restricted } = parsed.data;
  let slug = parsed.data.slug;
  if (slug && (await projectSlugTaken(tenant.orgId, slug))) {
    return slugTaken(reply);
  }
  slug ??= nextFreeSlug(slugify(name), await takenProjectSlugs(tenant.orgId));

  try {
    const row = await createProject(
      tenant.orgId,
      tenant.userId,
      tenant.role,
      { name, slug, description: description ?? null, restricted },
      actor(request, tenant.userId),
    );
    const role =
      roleOn(row, tenant.role, tenant.custom?.projectRole ?? null) ?? "ADMIN";
    return reply.code(201).send(summary(row, role));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return slugTaken(reply);
    }
    throw error;
  }
};

export const getProjectHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "project.read");
  if (!scope) {
    return reply;
  }
  return activeSummary(reply, scope);
};

export const updateProjectHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "project.update");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(UpdateProjectSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { slug } = parsed.data;
  if (
    slug !== undefined &&
    (await projectSlugTaken(scope.orgId, slug, scope.projectId))
  ) {
    return slugTaken(reply);
  }

  const data = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  );

  try {
    await updateProject(
      scope.orgId,
      scope.projectId,
      data,
      "project.updated",
      actor(request, scope.userId),
      data,
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return slugTaken(reply);
    }
    throw error;
  }

  return activeSummary(reply, scope);
};

const setArchived =
  (archived: boolean): RouteHandler =>
  async (request, reply) => {
    const scope = await requireProject(request, reply, "project.update");
    if (!scope) {
      return reply;
    }

    if (scope.isDefaultProject) {
      return defaultProject(reply, "The default project cannot be archived.");
    }

    if (scope.archived !== archived) {
      await updateProject(
        scope.orgId,
        scope.projectId,
        { archivedAt: archived ? new Date() : null },
        archived ? "project.archived" : "project.unarchived",
        actor(request, scope.userId),
      );
    }

    return activeSummary(reply, scope);
  };

export const archiveProjectHandler = setArchived(true);
export const unarchiveProjectHandler = setArchived(false);

export const deleteProjectHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "project.delete");
  if (!scope) {
    return reply;
  }

  if (scope.isDefaultProject) {
    return defaultProject(reply, "The default project cannot be deleted.");
  }

  if (await projectHasResources(scope.projectId)) {
    return reply.code(409).send({
      error: "project_not_empty",
      message:
        "Move or delete this project's agents, APIs, keys, webhooks, customers and service accounts first.",
    });
  }

  await softDeleteProject(
    scope.orgId,
    scope.projectId,
    scope.projectSlug,
    actor(request, scope.userId),
  );
  return reply.code(204).send();
};

const toProjectMember = (
  { customProjectRole, ...row }: ProjectMemberRow,
  restricted: boolean,
) => ({
  ...row,
  effectiveRole: effectiveProjectRole({
    customProjectRole,
    orgRole: row.orgRole,
    projectRole: row.projectRole,
    restricted,
  }),
});

const projectRestricted = async (scope: ProjectScope): Promise<boolean> => {
  const row = await getProject(scope.orgId, scope.userId, scope.projectId);
  return row?.restricted ?? true;
};

export const listProjectMembersHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "project.read");
  if (!scope) {
    return reply;
  }

  const restricted = await projectRestricted(scope);
  const rows = await listOrgMembersWithProjectRole(
    scope.orgId,
    scope.projectId,
  );
  return reply.send({
    items: rows.map((row) => toProjectMember(row, restricted)),
  });
};

const memberAfterChange = async (
  reply: FastifyReply,
  scope: ProjectScope,
  userId: string,
) => {
  const restricted = await projectRestricted(scope);
  const rows = await listOrgMembersWithProjectRole(
    scope.orgId,
    scope.projectId,
  );
  const row = rows.find((candidate) => candidate.userId === userId);
  return row
    ? reply.send(toProjectMember(row, restricted))
    : notFound(reply, "member");
};

export const setProjectMemberHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "project.members.manage");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(SetProjectMemberSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { userId } = request.params as { userId: string };
  if (!(await findOrgMember(scope.orgId, userId))) {
    return notFound(reply, "member");
  }

  await setProjectMember(
    scope.orgId,
    scope.projectId,
    userId,
    parsed.data.role,
    actor(request, scope.userId),
  );
  return memberAfterChange(reply, scope, userId);
};

export const removeProjectMemberHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "project.members.manage");
  if (!scope) {
    return reply;
  }

  const { userId } = request.params as { userId: string };
  const removed = await removeProjectMember(
    scope.orgId,
    scope.projectId,
    userId,
    actor(request, scope.userId),
  );
  return removed ? reply.code(204).send() : notFound(reply, "member");
};

export const moveResourcesHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(MoveResourcesSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { kind, ids, targetProjectId } = parsed.data;
  if (targetProjectId === scope.projectId) {
    return invalidBody(reply, [
      { path: "targetProjectId", message: "is the project these are in" },
    ]);
  }

  const target = await getProject(scope.orgId, scope.userId, targetProjectId);
  const targetRole = target
    ? roleOn(target, scope.orgRole, scope.customProjectRole)
    : null;
  if (!target || !targetRole) {
    return notFound(reply, "project");
  }

  const env = environmentOf(target, scope.environment);
  if (
    !env ||
    !permissionsOn(target, targetRole, scope.environment).includes(
      "resources.write",
    )
  ) {
    return reply.code(403).send({
      error: "forbidden",
      message: "You cannot add resources to that project.",
      permission: "resources.write",
    });
  }

  const result = await moveResources(
    kind,
    {
      orgId: scope.orgId,
      projectId: scope.projectId,
      environmentId: scope.environmentId,
    },
    { projectId: target.id, environmentId: env.id },
    ids,
    actor(request, scope.userId),
  );
  return reply.send(result);
};
