/**
 * Same hex pattern the API validates on write
 * (apps/be/src/controllers/me/schema.ts). Re-checked on read because the value
 * lands in a `style` attribute — a stored `javascript:` or `expression(...)`
 * string must never reach the DOM just because it passed validation once.
 */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const safeBrandColor = (
  value: string | null | undefined,
  allowed: boolean,
): string | null => {
  if (!allowed || !value) {
    return null;
  }
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed : null;
};
