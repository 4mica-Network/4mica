export const DEFAULT_PAGE_SIZE = 20;

export interface PendingMeta {
  pendingKey: string;
}

export const mirrorKeys = <const TKeys extends readonly string[]>(
  keys: TKeys,
): { [K in TKeys[number]]: K } =>
  Object.fromEntries(keys.map((key) => [key, key])) as {
    [K in TKeys[number]]: K;
  };

export const setPending = (
  pending: Record<string, boolean>,
  key: string | undefined,
  value: boolean,
): Record<string, boolean> => {
  if (!key) {
    return pending;
  }
  const next = { ...pending };
  if (value) {
    next[key] = true;
  } else {
    delete next[key];
  }
  return next;
};

export const definedParams = <T extends Record<string, unknown>>(
  params: T,
): { [K in keyof T]?: Exclude<T[K], "" | null | undefined> } =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== "" && value !== undefined && value !== null,
    ),
  ) as { [K in keyof T]?: Exclude<T[K], "" | null | undefined> };
