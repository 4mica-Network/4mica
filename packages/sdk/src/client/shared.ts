export const isNumericLike = (
  value: unknown,
): value is number | bigint | string =>
  typeof value === "number" ||
  typeof value === "bigint" ||
  typeof value === "string";
