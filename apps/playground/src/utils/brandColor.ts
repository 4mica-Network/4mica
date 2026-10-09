import { isHexColor } from "@4mica/rules";

export const safeBrandColor = (
  value: string | null | undefined,
  allowed: boolean,
): string | null => {
  if (!allowed || !value) {
    return null;
  }
  const trimmed = value.trim();
  return isHexColor(trimmed) ? trimmed : null;
};
