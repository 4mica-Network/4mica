export const ACTIVE_ORGANIZATION_STORAGE_KEY = "4mica.activeOrgId";

export const readActiveOrganizationId = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const writeActiveOrganizationId = (id: string | null): void => {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
    }
  } catch {}
};

export const resolveActiveId = (
  candidates: (string | null | undefined)[],
  items: { id: string }[],
  defaultId: string | null,
): string | null => {
  const known = new Set(items.map((item) => item.id));
  const match = candidates.find((id): id is string =>
    Boolean(id && known.has(id)),
  );
  if (match) {
    return match;
  }
  if (defaultId && known.has(defaultId)) {
    return defaultId;
  }
  return items[0]?.id ?? null;
};
