import type { EnvironmentKind, ProjectRole } from "@4mica/db";
import type { FastifyRequest } from "fastify";
import {
  effectiveProjectRole,
  type ProjectPermission,
  projectPermissionsFor,
} from "./permissions";
import { findProjectForMember } from "./repository";
import type { Tenant } from "./tenant";

export const PROJECT_HEADER = "x-project-id";
export const ENVIRONMENT_HEADER = "x-environment";

export interface ProjectScope {
  orgId: string;
  userId: string;
  orgRole: Tenant["role"];
  customProjectRole: ProjectRole | null;
  projectId: string;
  projectSlug: string;
  isDefaultProject: boolean;
  role: ProjectRole;
  environmentId: string;
  environment: EnvironmentKind;
  archived: boolean;
  restrictProduction: boolean;
  permissions: ProjectPermission[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENVIRONMENTS: Readonly<Record<string, EnvironmentKind>> = {
  sandbox: "SANDBOX",
  production: "PRODUCTION",
};

const single = (value: string | string[] | undefined): string | null => {
  if (value === undefined) {
    return "";
  }
  return Array.isArray(value) ? null : value.trim();
};

export const requestedProjectId = (
  request: FastifyRequest,
): string | null | undefined => {
  const value = single(request.headers[PROJECT_HEADER]);
  if (value === "") {
    return undefined;
  }
  return value && UUID.test(value) ? value.toLowerCase() : null;
};

export const requestedEnvironment = (
  request: FastifyRequest,
): EnvironmentKind | null => {
  const value = single(request.headers[ENVIRONMENT_HEADER]);
  if (value === "") {
    return "SANDBOX";
  }
  return value ? (ENVIRONMENTS[value.toLowerCase()] ?? null) : null;
};

const lookup = async (
  request: FastifyRequest,
  tenant: Tenant,
): Promise<ProjectScope | null> => {
  const projectId = requestedProjectId(request);
  const environment = requestedEnvironment(request);
  if (projectId === null || environment === null) {
    return null;
  }

  const project = await findProjectForMember(
    tenant.orgId,
    tenant.userId,
    projectId,
  );
  if (!project) {
    return null;
  }

  const role = effectiveProjectRole({
    orgRole: tenant.role,
    customProjectRole: tenant.custom?.projectRole ?? null,
    projectRole: project.members[0]?.role ?? null,
    restricted: project.restricted,
  });
  const env = project.environments.find((e) => e.kind === environment);
  if (!role || !env) {
    return null;
  }

  const archived = project.archivedAt !== null;
  return {
    orgId: tenant.orgId,
    userId: tenant.userId,
    orgRole: tenant.role,
    customProjectRole: tenant.custom?.projectRole ?? null,
    projectId: project.id,
    projectSlug: project.slug,
    isDefaultProject: project.isDefault,
    role,
    environmentId: env.id,
    environment,
    archived,
    restrictProduction: project.restrictProduction,
    permissions: projectPermissionsFor({
      role,
      environment,
      restrictProduction: project.restrictProduction,
      archived,
    }),
  };
};

const lookups = new WeakMap<FastifyRequest, Promise<ProjectScope | null>>();

export const resolveProject = (
  request: FastifyRequest,
  tenant: Tenant,
): Promise<ProjectScope | null> => {
  const pending = lookups.get(request) ?? lookup(request, tenant);
  lookups.set(request, pending);
  return pending;
};
