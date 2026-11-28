import { type EnvironmentKind, networksForEnvironment } from "@4mica/rules";

export interface ResourceScope {
  orgId: string;
  projectId: string;
  environmentId: string;
  environment: EnvironmentKind;
}

export const scopeWhere = (scope: ResourceScope) => ({
  organizationId: scope.orgId,
  projectId: scope.projectId,
  environmentId: scope.environmentId,
});

export const scopeData = (scope: ResourceScope) => ({
  organizationId: scope.orgId,
  projectId: scope.projectId,
  environmentId: scope.environmentId,
});

export const networkAllowed = (
  scope: Pick<ResourceScope, "environment">,
  network: string,
): boolean =>
  (networksForEnvironment(scope.environment) as string[]).includes(network);

export const networkIssue = (scope: Pick<ResourceScope, "environment">) => ({
  path: "network",
  message: `is not available in ${scope.environment === "PRODUCTION" ? "production" : "sandbox"}`,
});

export type ProjectAccess = string[] | null;

export const projectIn = (projects: ProjectAccess) =>
  projects === null ? {} : { projectId: { in: projects } };

export const projectInOrNone = (projects: ProjectAccess) =>
  projects === null
    ? {}
    : { AND: [{ OR: [{ projectId: null }, { projectId: { in: projects } }] }] };
