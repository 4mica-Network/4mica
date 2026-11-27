import type { Environment } from "./type";

export const ACTIVE_PROJECT_STORAGE_PREFIX = "4mica.activeProjectId.";
export const ENVIRONMENT_STORAGE_KEY = "4mica.environment";

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null): void => {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {}
};

export const readActiveProjectId = (organizationId: string): string | null =>
  read(`${ACTIVE_PROJECT_STORAGE_PREFIX}${organizationId}`);

export const writeActiveProjectId = (
  organizationId: string,
  id: string | null,
): void => write(`${ACTIVE_PROJECT_STORAGE_PREFIX}${organizationId}`, id);

export const readEnvironment = (): Environment =>
  read(ENVIRONMENT_STORAGE_KEY) === "production" ? "production" : "sandbox";

export const writeEnvironment = (environment: Environment): void =>
  write(ENVIRONMENT_STORAGE_KEY, environment);
