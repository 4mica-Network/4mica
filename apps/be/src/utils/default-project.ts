import type { Prisma } from "@4mica/db";

export const DEFAULT_PROJECT_SLUG = "default";

export const environmentsCreate =
  (): Prisma.EnvironmentCreateNestedManyWithoutProjectInput => ({
    create: [{ kind: "SANDBOX" }, { kind: "PRODUCTION" }],
  });

export const defaultProjectCreate =
  (): Prisma.ProjectCreateWithoutOrganizationInput => ({
    slug: DEFAULT_PROJECT_SLUG,
    name: "Default",
    isDefault: true,
    environments: environmentsCreate(),
  });
