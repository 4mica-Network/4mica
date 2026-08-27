export const mirrorKeys = <const TKeys extends readonly string[]>(
  keys: TKeys,
): { [K in TKeys[number]]: K } =>
  Object.fromEntries(keys.map((key) => [key, key])) as {
    [K in TKeys[number]]: K;
  };
