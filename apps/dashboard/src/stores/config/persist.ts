import type { AppConfig } from "./type";

export const CONFIG_STORAGE_KEY = "4mica.config.v2";

export interface CachedConfig {
  config: AppConfig;
  fetchedAt: number;
}

export const readConfigCache = (): CachedConfig | null => {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<CachedConfig>;
    if (
      typeof parsed.config?.version !== "string" ||
      typeof parsed.fetchedAt !== "number"
    ) {
      return null;
    }
    return parsed as CachedConfig;
  } catch {
    return null;
  }
};

export const writeConfigCache = (cached: CachedConfig): void => {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cached));
  } catch {}
};
