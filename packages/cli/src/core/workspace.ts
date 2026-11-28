import { usageError } from "../errors.js";
import {
  readContext,
  type SavedContext,
  type SavedOrganization,
  type SavedProject,
} from "./config-file.js";
import {
  api,
  type BoundOrganization,
  badResponse,
  type Platform,
  type Session,
} from "./platform.js";
import { readEnv } from "./settings.js";

export const ENVIRONMENTS = ["sandbox", "production"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const ORG_HEADER = "x-org-id";
export const PROJECT_HEADER = "x-project-id";
export const ENVIRONMENT_HEADER = "x-environment";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Organization {
  id: string;
  handle: string | null;
  name: string;
  personal: boolean;
  role: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  archived: boolean;
  role: string;
}

export interface ContextFlags {
  org?: string;
  project?: string;
  env?: string;
}

export type ContextSource = "flag" | "env" | "config" | "session" | "default";

export interface ContextEntry {
  id: string | null;
  name: string | null;
  source: ContextSource;
}

export interface ActiveContext {
  organization: ContextEntry;
  project: ContextEntry;
  environment: { name: Environment; source: ContextSource };
}

type Env = Record<string, string | undefined>;

interface Choice {
  value: string;
  source: "flag" | "env";
}

const choose = (
  flag: string | undefined,
  env: Env,
  name: string,
): Choice | undefined => {
  const fromFlag = flag?.trim();
  if (fromFlag) return { value: fromFlag, source: "flag" };
  const fromEnv = readEnv(env, name)?.trim();
  return fromEnv ? { value: fromEnv, source: "env" } : undefined;
};

export function requireEnvironment(value: string): Environment {
  const name = value.trim().toLowerCase();
  if ((ENVIRONMENTS as readonly string[]).includes(name)) {
    return name as Environment;
  }
  throw usageError(`unknown environment "${value}"`, {
    code: "UNKNOWN_ENVIRONMENT",
    suggestions: [`use one of: ${ENVIRONMENTS.join(", ")}`],
  });
}

const savedProjectFor = (
  saved: SavedContext,
  orgId: string | null,
): SavedProject | undefined =>
  saved.project && saved.project.orgId === orgId ? saved.project : undefined;

const organizationLabel = (org: SavedOrganization) => org.handle ?? org.name;

export function offlineContext(
  saved: SavedContext,
  flags: ContextFlags = {},
  env: Env = process.env,
): ActiveContext {
  const org = choose(flags.org, env, "ORG");
  const project = choose(flags.project, env, "PROJECT");
  const environment = choose(flags.env, env, "ENV");

  const organization: ContextEntry = org
    ? {
        id: UUID.test(org.value) ? org.value.toLowerCase() : null,
        name: org.value,
        source: org.source,
      }
    : saved.org
      ? {
          id: saved.org.id,
          name: organizationLabel(saved.org),
          source: "config",
        }
      : { id: null, name: null, source: "default" };

  const savedProject =
    org === undefined ? savedProjectFor(saved, saved.org?.id ?? null) : null;

  return {
    organization,
    project: project
      ? {
          id: UUID.test(project.value) ? project.value.toLowerCase() : null,
          name: project.value,
          source: project.source,
        }
      : savedProject
        ? { id: savedProject.id, name: savedProject.slug, source: "config" }
        : { id: null, name: null, source: "default" },
    environment: environment
      ? {
          name: requireEnvironment(environment.value),
          source: environment.source,
        }
      : saved.environment
        ? { name: requireEnvironment(saved.environment), source: "config" }
        : { name: "sandbox", source: "default" },
  };
}

const isOrganization = (value: unknown): value is Organization => {
  const org = (value ?? {}) as Partial<Organization>;
  return typeof org.id === "string" && typeof org.name === "string";
};

const isProject = (value: unknown): value is Project => {
  const project = (value ?? {}) as Partial<Project>;
  return typeof project.id === "string" && typeof project.slug === "string";
};

export async function listOrganizations(
  platform: Platform,
  token: string,
): Promise<{ items: Organization[]; defaultId: string | null }> {
  const body = await api<{ items?: unknown; defaultId?: unknown }>(
    platform,
    "/me/organizations",
    { token },
  );
  if (!Array.isArray(body?.items) || !body.items.every(isOrganization)) {
    throw badResponse("a list of organizations");
  }
  return {
    items: body.items,
    defaultId: typeof body.defaultId === "string" ? body.defaultId : null,
  };
}

export async function listProjects(
  platform: Platform,
  token: string,
): Promise<Project[]> {
  const body = await api<{ items?: unknown }>(platform, "/me/projects", {
    token,
  });
  if (!Array.isArray(body?.items) || !body.items.every(isProject)) {
    throw badResponse("a list of projects");
  }
  return body.items;
}

export function findOrganization(
  items: Organization[],
  reference: string,
): Organization {
  const wanted = reference.trim().toLowerCase();
  const found = items.find(
    (org) => org.id === wanted || org.handle?.toLowerCase() === wanted,
  );
  if (found) return found;
  throw usageError(`you are not in an organization called "${reference}"`, {
    code: "UNKNOWN_ORGANIZATION",
    suggestions: ["`4mica orgs` lists the ones you can use"],
  });
}

export function findProject(items: Project[], reference: string): Project {
  const wanted = reference.trim().toLowerCase();
  const found = items.find(
    (project) => project.id === wanted || project.slug.toLowerCase() === wanted,
  );
  if (found) return found;
  throw usageError(`there is no project called "${reference}" you can use`, {
    code: "UNKNOWN_PROJECT",
    suggestions: ["`4mica projects` lists the ones in the organization in use"],
  });
}

export const withHeaders = (
  platform: Platform,
  context: ActiveContext,
  only: "org" | "all" = "all",
): Platform => ({
  ...platform,
  headers: {
    ...(context.organization.id
      ? { [ORG_HEADER]: context.organization.id }
      : {}),
    ...(only === "all" && context.project.id
      ? { [PROJECT_HEADER]: context.project.id }
      : {}),
    ...(only === "all" && context.environment.source !== "default"
      ? { [ENVIRONMENT_HEADER]: context.environment.name }
      : {}),
  },
});

export async function resolveContext(
  session: Session,
  configDir: string,
  flags: ContextFlags = {},
  env: Env = process.env,
): Promise<{ session: Session; context: ActiveContext }> {
  const saved = await readContext(configDir);
  const context = offlineContext(saved, flags, env);

  if (context.organization.id === null && context.organization.name !== null) {
    const { items } = await listOrganizations(session.platform, session.token);
    const org = findOrganization(items, context.organization.name);
    context.organization = { ...context.organization, id: org.id };
  }

  const savedProject = savedProjectFor(saved, context.organization.id);
  if (context.project.source === "default" && savedProject) {
    context.project = {
      id: savedProject.id,
      name: savedProject.slug,
      source: "config",
    };
  }

  if (context.project.id === null && context.project.name !== null) {
    const projects = await listProjects(
      withHeaders(session.platform, context, "org"),
      session.token,
    );
    const project = findProject(projects, context.project.name);
    context.project = { ...context.project, id: project.id };
  }

  return {
    session: { ...session, platform: withHeaders(session.platform, context) },
    context,
  };
}

const SOURCE_LABELS: Record<ContextSource, string> = {
  flag: "from the flag",
  env: "from the environment",
  config: "from the config file",
  session: "the session is limited to it",
  default: "default",
};

export function applyBinding(
  context: ActiveContext,
  bound: BoundOrganization | null | undefined,
): { context: ActiveContext; conflict: string | null } {
  if (!bound) return { context, conflict: null };
  const other = context.organization;
  return {
    context: {
      ...context,
      organization: {
        id: bound.id,
        name: bound.handle ?? bound.name,
        source: "session",
      },
    },
    conflict:
      other.id !== null && other.id !== bound.id
        ? `the session is limited to ${bound.handle ?? bound.name}, so ${other.name} (${SOURCE_LABELS[other.source]}) cannot be used; sign in again with \`4mica auth login --org ${other.name}\``
        : null,
  };
}

const describeEntry = (entry: ContextEntry, fallback: string): string =>
  entry.name === null
    ? fallback
    : `${entry.name} (${SOURCE_LABELS[entry.source]})`;

export const contextFields = (context: ActiveContext): [string, string][] => [
  ["organization", describeEntry(context.organization, "your default one")],
  ["project", describeEntry(context.project, "the default one")],
  [
    "environment",
    `${context.environment.name} (${SOURCE_LABELS[context.environment.source]})`,
  ],
];
